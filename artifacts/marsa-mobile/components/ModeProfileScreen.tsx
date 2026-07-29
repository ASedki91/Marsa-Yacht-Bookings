import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import colors from "@/constants/colors";
import { useAppMode } from "@/contexts/AppModeContext";
import { usePushNotifications } from "@/contexts/PushNotificationsContext";
import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";

type ProfileMode = "guest" | "host";

interface ProfileRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  danger?: boolean;
  onPress: () => void;
}

function ProfileRow({ icon, label, detail, danger, onPress }: ProfileRowProps) {
  const palette = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: palette.border,
          backgroundColor: palette.card,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: danger
              ? palette.destructive + "14"
              : palette.primary + "14",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={danger ? palette.destructive : palette.primary}
        />
      </View>
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? palette.destructive : palette.foreground },
        ]}
      >
        {label}
      </Text>
      {!!detail && (
        <Text
          numberOfLines={1}
          style={[styles.rowDetail, { color: palette.mutedForeground }]}
        >
          {detail}
        </Text>
      )}
      <Ionicons
        name="chevron-forward"
        size={17}
        color={palette.mutedForeground}
      />
    </Pressable>
  );
}

export function ModeProfileScreen({ mode }: { mode: ProfileMode }) {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user, isHost, isAdmin } = useUser();
  const { setMode } = useAppMode();
  const pushNotifications = usePushNotifications();
  const topPad = Platform.OS === "web" ? 24 : insets.top;

  const displayName =
    user?.name?.trim() ||
    user?.email
      ?.split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ||
    "MARSA User";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const switchInterface = async () => {
    const nextMode = mode === "guest" ? "host" : "guest";
    await setMode(nextMode);
    router.replace(
      (nextMode === "host"
        ? "/(home)/host/(tabs)/dashboard"
        : "/(home)/guest/(tabs)/home") as any,
    );
  };

  const signOutUser = () => {
    Alert.alert("Sign out", "Do you want to sign out of MARSA?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await pushNotifications.deactivate();
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  const managePushNotifications = () => {
    if (!pushNotifications.isSupported) {
      Alert.alert(
        "Mobile app required",
        "Push notifications are available in the MARSA iOS and Android apps. In-app notifications still work here.",
      );
      return;
    }
    if (pushNotifications.isEnabled) {
      Alert.alert(
        "Turn off push notifications?",
        "You will still receive updates inside the MARSA app.",
        [
          { text: "Keep enabled", style: "cancel" },
          {
            text: "Turn off",
            style: "destructive",
            onPress: () =>
              pushNotifications
                .deactivate()
                .catch((error) =>
                  Alert.alert("Could not update notifications", error.message),
                ),
          },
        ],
      );
      return;
    }

    Alert.alert(
      "Stay up to date",
      "Enable push notifications for booking decisions, trip updates, host requests, and important MARSA announcements.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Enable",
          onPress: () =>
            pushNotifications
              .enable()
              .catch((error) =>
                Alert.alert("Could not enable notifications", error.message),
              ),
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topPad + 12,
            paddingBottom: Platform.OS === "web" ? 36 : insets.bottom + 92,
          },
        ]}
      >
        <View style={[styles.identity, { backgroundColor: colors.light.navy }]}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{user?.email ?? ""}</Text>
            <View style={styles.modePill}>
              <View style={styles.modeDot} />
              <Text style={styles.modeLabel}>
                {mode === "host" ? "Host mode" : "Guest mode"}
              </Text>
            </View>
          </View>
        </View>

        {isHost ? (
          <Pressable
            onPress={switchInterface}
            style={({ pressed }) => [
              styles.switchCard,
              {
                backgroundColor: palette.card,
                borderColor: palette.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.switchIcon, { backgroundColor: palette.primary + "18" }]}>
              <Ionicons
                name={mode === "guest" ? "boat-outline" : "compass-outline"}
                size={25}
                color={palette.primary}
              />
            </View>
            <View style={styles.switchCopy}>
              <Text style={[styles.switchTitle, { color: palette.foreground }]}>
                Switch to {mode === "guest" ? "host" : "guest"} mode
              </Text>
              <Text style={[styles.switchSubtitle, { color: palette.mutedForeground }]}>
                {mode === "guest"
                  ? "Manage yachts, availability, bookings, and earnings."
                  : "Browse yachts, wishlists, and your personal trips."}
              </Text>
            </View>
            <Ionicons name="swap-horizontal" size={22} color={palette.primary} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/(home)/become-host")}
            style={[styles.switchCard, { backgroundColor: palette.card, borderColor: colors.light.gold }]}
          >
            <View style={[styles.switchIcon, { backgroundColor: colors.light.gold + "18" }]}>
              <Ionicons name="boat-outline" size={25} color={colors.light.gold} />
            </View>
            <View style={styles.switchCopy}>
              <Text style={[styles.switchTitle, { color: palette.foreground }]}>
                Become a host
              </Text>
              <Text style={[styles.switchSubtitle, { color: palette.mutedForeground }]}>
                Apply to list your yacht for rental on MARSA.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={palette.mutedForeground} />
          </Pressable>
        )}

        <Text style={[styles.sectionLabel, { color: palette.mutedForeground }]}>
          {mode === "host" ? "HOST TOOLS" : "GUEST TOOLS"}
        </Text>
        <View style={styles.group}>
          {mode === "host" ? (
            <>
              <ProfileRow
                icon="boat-outline"
                label="My yachts"
                onPress={() => router.push("/(home)/host/(tabs)/yachts" as any)}
              />
              <ProfileRow
                icon="calendar-outline"
                label="Guest bookings"
                onPress={() => router.push("/(home)/host/(tabs)/bookings" as any)}
              />
              <ProfileRow
                icon="cash-outline"
                label="Earnings"
                onPress={() => router.push("/(home)/host/(tabs)/earnings" as any)}
              />
            </>
          ) : (
            <>
              <ProfileRow
                icon="calendar-outline"
                label="My bookings"
                onPress={() => router.push("/(home)/guest/(tabs)/bookings" as any)}
              />
              <ProfileRow
                icon="heart-outline"
                label="Wishlist"
                onPress={() => router.push("/(home)/guest/(tabs)/wishlist" as any)}
              />
            </>
          )}
          <ProfileRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/(home)/notifications")}
          />
          <ProfileRow
            icon="phone-portrait-outline"
            label="Push notifications"
            detail={
              pushNotifications.isLoading
                ? "Updating…"
                : pushNotifications.isEnabled
                  ? "Enabled"
                  : "Off"
            }
            onPress={managePushNotifications}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: palette.mutedForeground }]}>
          ACCOUNT
        </Text>
        <View style={styles.group}>
          <ProfileRow
            icon="person-outline"
            label="Account details"
            detail={isAdmin ? "Admin" : isHost ? "Host" : "Guest"}
            onPress={() => router.push("/(home)/profile")}
          />
          <ProfileRow
            icon="help-circle-outline"
            label="Help & support"
            onPress={() =>
              Alert.alert(
                "MARSA support",
                "Contact support@marsa.app for help with your account or bookings.",
              )
            }
          />
          <ProfileRow
            icon="log-out-outline"
            label="Sign out"
            danger
            onPress={signOutUser}
          />
        </View>

        <Text style={[styles.version, { color: palette.mutedForeground }]}>
          MARSA v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    gap: 15,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  initials: {
    color: colors.light.navy,
    fontFamily: "Inter_700Bold",
    fontSize: 23,
  },
  identityCopy: { flex: 1 },
  name: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 20 },
  email: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  modePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.13)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 10,
  },
  modeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.light.gold },
  modeLabel: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  switchCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    gap: 12,
    marginBottom: 24,
  },
  switchIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  switchCopy: { flex: 1 },
  switchTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  switchSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.1,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: { gap: 8, marginBottom: 24 },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 11,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowDetail: { maxWidth: 95, fontFamily: "Inter_400Regular", fontSize: 12 },
  version: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
});
