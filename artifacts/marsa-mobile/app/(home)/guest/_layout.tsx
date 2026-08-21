import { Redirect, Stack } from "expo-router";

import { useAppMode } from "@/contexts/AppModeContext";

export default function GuestLayout() {
  const { mode, isReady } = useAppMode();

  if (!isReady) return null;
  if (mode === "host") {
    return <Redirect href={"/(home)/host/(tabs)/dashboard" as any} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
