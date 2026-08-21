import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { UserProvider } from "@/contexts/UserContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { PushNotificationsProvider } from "@/contexts/PushNotificationsContext";
import { useColors } from "@/hooks/useColors";
import { devBypass } from "@/lib/devBypass";
import { API_BASE_URL } from "@/lib/env";

if (API_BASE_URL) setBaseUrl(API_BASE_URL);

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const colors = useColors();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded && !(__DEV__ && devBypass.active)) return null;
  if (!isSignedIn && !(__DEV__ && devBypass.active))
    return <Redirect href="/(auth)/sign-in" />;

  return (
    <UserProvider>
      <AppModeProvider>
        <PushNotificationsProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="guest" options={{ headerShown: false }} />
            <Stack.Screen name="host" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="yacht/[id]"
              options={{
                headerShown: true,
                title: "",
                headerTransparent: true,
                headerTintColor: "#FFFFFF",
                headerBackTitle: "",
              }}
            />
            <Stack.Screen name="book/[id]" options={{ headerShown: false }} />
            <Stack.Screen
              name="booking/[id]"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="review/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="become-host" options={{ headerShown: false }} />
            <Stack.Screen name="new-yacht" options={{ headerShown: false }} />
            <Stack.Screen
              name="notifications"
              options={{
                headerShown: true,
                title: "Notifications",
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.foreground,
              }}
            />
          </Stack>
        </PushNotificationsProvider>
      </AppModeProvider>
    </UserProvider>
  );
}
