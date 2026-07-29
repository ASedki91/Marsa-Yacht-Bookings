import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth, useUser as useClerkUser } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/env";

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

async function fetchMe(token: string | null): Promise<UserProfile> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  const data = await res.json();
  const raw = data.user ?? data;
  return {
    id: raw.id,
    clerkId: raw.clerkId,
    email: raw.email,
    name: raw.fullName ?? raw.name ?? undefined,
    role: raw.role ?? "guest",
    avatarUrl: raw.avatarUrl ?? undefined,
  };
}

async function syncUser(
  token: string | null,
  payload: { email: string; fullName?: string; avatarUrl?: string },
): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useClerkUser();
  const [synced, setSynced] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isSignedIn || synced) return;
    if (!clerkUser) return;

    const email = clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) return;

    getToken().then((token) => {
      const metaName =
        typeof clerkUser.unsafeMetadata?.fullName === "string"
          ? (clerkUser.unsafeMetadata.fullName as string)
          : undefined;
      syncUser(token, {
        email,
        fullName: clerkUser.fullName ?? metaName,
        avatarUrl: clerkUser.imageUrl ?? undefined,
      })
        .catch(() => {})
        .finally(() => {
          setSynced(true);
          qc.invalidateQueries({ queryKey: ["me"] });
        });
    });
  }, [isSignedIn, clerkUser, synced]);

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
