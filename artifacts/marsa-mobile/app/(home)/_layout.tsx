import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { UserProvider } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const colors = useColors();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <UserProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
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
        <Stack.Screen
          name="book/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="review/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="become-host"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="new-yacht"
          options={{ headerShown: false }}
        />
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
    </UserProvider>
  );
}
