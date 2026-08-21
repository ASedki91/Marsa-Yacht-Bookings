import { Redirect, Stack } from "expo-router";

import { useAppMode } from "@/contexts/AppModeContext";
import { useUser } from "@/contexts/UserContext";

export default function HostLayout() {
  const { mode, isReady } = useAppMode();
  const { isHost, isLoading } = useUser();

  if (!isReady || isLoading) return null;
  if (!isHost || mode !== "host") {
    return <Redirect href={"/(home)/guest/(tabs)/home" as any} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
