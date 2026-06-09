import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UserProfile {
  id: string;
  clerkId: string;
  email: string;
  name?: string;
  role: string;
  avatarUrl?: string;
}

interface UserContextType {
  user: UserProfile | null;
  isHost: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  isHost: false,
  isAdmin: false,
  isLoading: true,
  refetch: () => {},
});

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function fetchMe(token: string | null): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

async function syncUser(token: string | null): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [synced, setSynced] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isSignedIn || synced) return;
    getToken().then((token) => {
      syncUser(token)
        .catch(() => {})
        .finally(() => {
          setSynced(true);
          qc.invalidateQueries({ queryKey: ["me"] });
        });
    });
  }, [isSignedIn, synced]);

  const { data: user, isLoading, refetch } = useQuery<UserProfile | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const token = await getToken();
      return fetchMe(token);
    },
    enabled: !!isSignedIn && synced,
    retry: false,
    staleTime: 60_000,
  });

  const role = user?.role ?? "guest";

  return (
    <UserContext.Provider
      value={{
        user: user ?? null,
        isHost: role === "host" || role === "admin",
        isAdmin: role === "admin",
        isLoading: isLoading && !user,
        refetch,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
