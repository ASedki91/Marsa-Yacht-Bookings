import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  deactivatePushToken,
  registerPushToken,
} from "@workspace/api-client-react";

import { useUser } from "@/contexts/UserContext";

interface StoredPushRegistration {
  id: string;
  expoPushToken: string;
}

interface PushNotificationsContextValue {
  isSupported: boolean;
  isEnabled: boolean;
  isLoading: boolean;
  enable: () => Promise<void>;
  deactivate: () => Promise<void>;
}

const PushNotificationsContext =
  createContext<PushNotificationsContextValue | null>(null);

function registrationKey(userId: string) {
  return `marsa:push-registration:${userId}`;
}

async function getDeviceId() {
  const key = "marsa:push-device-id";
  const stored = await AsyncStorage.getItem(key);
  if (stored) return stored;
  const created = `marsa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(key, created);
  return created;
}

function notificationTarget(data: Record<string, unknown>) {
  const type =
    typeof data.relatedEntityType === "string"
      ? data.relatedEntityType
      : typeof data.entityType === "string"
        ? data.entityType
        : "";
  const id =
    typeof data.relatedEntityId === "string"
      ? data.relatedEntityId
      : typeof data.entityId === "string"
        ? data.entityId
        : "";

  if (type === "booking" && id) return `/(home)/booking/${id}`;
  if (type === "yacht" && id) return `/(home)/yacht/${id}`;
  if (type === "notification_campaign") return "/(home)/notifications";
  return null;
}

export function PushNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const router = useRouter();
  const isSupported = Platform.OS === "ios" || Platform.OS === "android";
  const [registration, setRegistration] =
    useState<StoredPushRegistration | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) {
      setRegistration(null);
      return () => {
        mounted = false;
      };
    }

    AsyncStorage.getItem(registrationKey(user.id))
      .then((value) => {
        if (!mounted || !value) return;
        setRegistration(JSON.parse(value) as StoredPushRegistration);
      })
      .catch(() => {
        if (mounted) setRegistration(null);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isSupported) return;

    let subscription: { remove: () => void } | undefined;
    try {
      const Notifications = require("expo-notifications");
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        }),
      });
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response?.notification?.request?.content?.data;
          if (!data || typeof data !== "object") return;
          const target = notificationTarget(data as Record<string, unknown>);
          if (target) router.push(target as any);
        },
      );
    } catch {
      // Native push is optional in web previews and Expo Go.
    }

    return () => subscription?.remove();
  }, [isSupported, router]);

  const enable = useCallback(async () => {
    if (!isSupported) {
      throw new Error("Push notifications are available in the iOS and Android apps.");
    }
    if (!user?.id) throw new Error("Sign in before enabling push notifications.");

    setIsLoading(true);
    try {
      const Notifications = require("expo-notifications");
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "MARSA updates",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const current = await Notifications.getPermissionsAsync();
      const permission =
        current.status === "granted"
          ? current
          : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error(
          "Notification permission was not granted. You can enable it later in device settings.",
        );
      }

      const projectId =
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
        Constants.easConfig?.projectId ??
        (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
      if (!projectId) {
        throw new Error(
          "This development build is missing its Expo project ID. Add EXPO_PUBLIC_EAS_PROJECT_ID before testing push.",
        );
      }

      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
      const saved = await registerPushToken({
        expoPushToken: tokenResult.data,
        deviceId: await getDeviceId(),
        platform: Platform.OS === "ios" ? "ios" : "android",
        appVersion: Constants.expoConfig?.version,
      });
      const next = { id: saved.id, expoPushToken: tokenResult.data };
      await AsyncStorage.setItem(registrationKey(user.id), JSON.stringify(next));
      setRegistration(next);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user?.id]);

  const deactivate = useCallback(async () => {
    if (!registration || !user?.id) return;
    setIsLoading(true);
    try {
      await deactivatePushToken(registration.id).catch(() => {});
      await AsyncStorage.removeItem(registrationKey(user.id));
      setRegistration(null);
    } finally {
      setIsLoading(false);
    }
  }, [registration, user?.id]);

  const value = useMemo(
    () => ({
      isSupported,
      isEnabled: !!registration,
      isLoading,
      enable,
      deactivate,
    }),
    [deactivate, enable, isLoading, isSupported, registration],
  );

  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications() {
  const context = useContext(PushNotificationsContext);
  if (!context) {
    throw new Error(
      "usePushNotifications must be used inside PushNotificationsProvider",
    );
  }
  return context;
}
