import { Redirect } from "expo-router";

import { useAppMode } from "@/contexts/AppModeContext";
import { useUser } from "@/contexts/UserContext";

export default function HomeIndex() {
  const { mode, isReady } = useAppMode();
  const { isHost, isLoading } = useUser();

  if (!isReady || isLoading) return null;
  if (mode === "host" && isHost) {
    return <Redirect href={"/(home)/host/(tabs)/dashboard" as any} />;
  }
  return <Redirect href={"/(home)/guest/(tabs)/home" as any} />;
}
