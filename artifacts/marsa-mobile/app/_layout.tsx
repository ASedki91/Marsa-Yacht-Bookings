import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { Marcellus_400Regular } from "@expo-google-fonts/marcellus";
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from "@expo-google-fonts/space-mono";
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
} from "@expo-google-fonts/tajawal";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ClerkProvider, type TokenCache } from "@clerk/expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PaymentConfigProvider } from "@/contexts/PaymentConfigContext";

SplashScreen.preventAutoHideAsync();

const tokenCache: TokenCache = {
  getToken: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  saveToken: async (key: string, token: string) => {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch {
      // A session can continue even when a device rejects a SecureStore key.
    }
  },
  clearToken: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Clerk will still clear the in-memory session.
    }
  },
};

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(home)" options={{ headerShown: false }} />
      <Stack.Screen name="legal/[document]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, setLoaded] = useState(false);
  const clerkProxyUrl =
    process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          HankenGrotesk_400Regular,
          HankenGrotesk_500Medium,
          HankenGrotesk_600SemiBold,
          HankenGrotesk_700Bold,
          Marcellus_400Regular,
          SpaceMono_400Regular,
          SpaceMono_700Bold,
          Tajawal_400Regular,
          Tajawal_500Medium,
          Tajawal_700Bold,
          ...Ionicons.font,
          ...Feather.font,
          ...MaterialIcons.font,
        });
      } finally {
        setLoaded(true);
        SplashScreen.hideAsync();
      }
    })();
  }, []);

  if (!loaded) return null;

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      proxyUrl={clerkProxyUrl}
      tokenCache={tokenCache}
    >
      <PaymentConfigProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </PaymentConfigProvider>
    </ClerkProvider>
  );
}
