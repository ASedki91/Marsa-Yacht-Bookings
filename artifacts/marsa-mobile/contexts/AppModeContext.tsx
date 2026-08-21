import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useUser } from "@/contexts/UserContext";

export type AppMode = "guest" | "host";

interface AppModeContextValue {
  mode: AppMode;
  isReady: boolean;
  canUseHostMode: boolean;
  setMode: (mode: AppMode) => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

function storageKey(userId: string) {
  return `marsa:interface-mode:${userId}`;
}

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const { user, isHost, isLoading } = useUser();
  const [mode, setModeState] = useState<AppMode>("guest");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    if (isLoading) {
      setIsReady(false);
      return () => {
        active = false;
      };
    }

    if (!user?.id) {
      setModeState("guest");
      setIsReady(true);
      return () => {
        active = false;
      };
    }

    setIsReady(false);
    AsyncStorage.getItem(storageKey(user.id))
      .then((stored) => {
        if (!active) return;
        setModeState(stored === "host" && isHost ? "host" : "guest");
      })
      .catch(() => {
        if (active) setModeState("guest");
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, [isHost, isLoading, user?.id]);

  useEffect(() => {
    if (isReady && mode === "host" && !isHost) {
      setModeState("guest");
      if (user?.id) {
        AsyncStorage.setItem(storageKey(user.id), "guest").catch(() => {});
      }
    }
  }, [isHost, isReady, mode, user?.id]);

  const setMode = useCallback(
    async (nextMode: AppMode) => {
      const allowedMode = nextMode === "host" && !isHost ? "guest" : nextMode;
      setModeState(allowedMode);
      if (user?.id) {
        await AsyncStorage.setItem(storageKey(user.id), allowedMode);
      }
    },
    [isHost, user?.id],
  );

  const value = useMemo(
    () => ({
      mode,
      isReady,
      canUseHostMode: isHost,
      setMode,
    }),
    [isHost, isReady, mode, setMode],
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used inside AppModeProvider");
  }
  return context;
}
