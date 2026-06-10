import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert,
  ActivityIndicator,
} from "react-native";
import { useClerk, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import colors from "@/constants/colors";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  iconColor?: string;
  badge?: string;
}

function SettingRow({ icon, label, value, onPress, danger, iconColor, badge }: SettingRowProps) {
  const c = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingRow,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: (iconColor ?? c.primary) + "18" }]}>
        <Ionicons name={icon} size={20} color={iconColor ?? c.primary} />
      </View>
      <Text style={[styles.settingLabel, { color: danger ? c.destructive : c.foreground }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.settingRight}>
        {badge && (
          <View style={[styles.badge, { backgroundColor: colors.light.ocean }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        {value && <Text style={[styles.settingValue, { color: c.mutedForeground }]} numberOfLines={1}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const router = useRouter();
  const { user, isHost, isAdmin } = useUser();
  const [hostLoading, setHostLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  const handleBecomeHost = async () => {
    setHostLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/api/dev/become-host`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error ?? "Failed to become host");
        return;
      }
      Alert.alert("Success!", data.message ?? "You are now a host with demo data.", [
        { text: "OK", onPress: () => router.replace("/(home)/(tabs)/explore") },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Network error");
    } finally {
      setHostLoading(false);
    }
  };

  const emailName = user?.email
    ? user.email
        .split("@")[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : "";
  const displayName = user?.name?.trim() || emailName || "MARSA User";

  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const roleBadge = isAdmin ? "Admin" : isHost ? "Host" : "Guest";
  const roleBadgeColor = isAdmin ? "#7C3AED" : isHost ? colors.light.ocean : colors.light.gold;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 12, paddingBottom: bottomPad + 90 }]}
      >
        <View style={[styles.avatarCard, { backgroundColor: colors.light.navy }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <Text style={styles.avatarName}>{displayName}</Text>
          <Text style={styles.avatarEmail}>{user?.email ?? ""}</Text>
          <View style={[styles.rolePill, { backgroundColor: roleBadgeColor + "30", borderColor: roleBadgeColor }]}>
            <Text style={[styles.roleText, { color: roleBadgeColor }]}>{roleBadge}</Text>
          </View>
          {!isHost && (
            <Pressable
              onPress={handleBecomeHost}
              disabled={hostLoading}
              style={[styles.devBtn, { opacity: hostLoading ? 0.6 : 1 }]}
            >
              {hostLoading ? (
                <ActivityIndicator size="small" color={colors.light.gold} />
              ) : (
                <>
                  <Ionicons name="rocket-outline" size={14} color={colors.light.gold} />
                  <Text style={styles.devBtnText}>Become a Host (Dev)</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>ACCOUNT</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/(home)/notifications")}
          />
          {!isHost && (
            <SettingRow
              icon="boat-outline"
              label="Become a Host"
              badge="New"
              iconColor={colors.light.gold}
              onPress={() => router.push("/(home)/become-host")}
            />
          )}
          {isHost && (
            <SettingRow
              icon="boat-outline"
              label="Become a Host"
              badge="Active"
              iconColor={colors.light.ocean}
              onPress={() => Alert.alert("You are already a host", "Go to your yachts or bookings tab to manage your listings.")}
            />
          )}
          {isAdmin && (
            <SettingRow
              icon="shield-checkmark-outline"
              label="Admin Panel"
              iconColor="#7C3AED"
              onPress={() => Alert.alert("Admin Panel", "Access the admin dashboard from a web browser.")}
            />
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>ABOUT MARSA</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="information-circle-outline"
            label="About MARSA"
            onPress={() => Alert.alert("MARSA", "El Gouna's premier yacht charter marketplace.\n\nVersion 1.0.0")}
          />
          <SettingRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => Alert.alert("Privacy Policy", "Coming soon.")}
          />
          <SettingRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Alert.alert("Terms of Service", "Coming soon.")}
          />
          <SettingRow
            icon="headset-outline"
            label="Support"
            onPress={() => Alert.alert("Support", "Contact us at support@marsa.app")}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>SESSION</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            danger
            iconColor={c.destructive}
            onPress={handleSignOut}
          />
        </View>

        <Text style={[styles.version, { color: c.mutedForeground }]}>MARSA v1.0.0 · El Gouna, Egypt</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 10 },
  avatarCard: { borderRadius: 20, padding: 24, alignItems: "center", gap: 8, marginBottom: 8 },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  avatarName: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  avatarEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#CBD5E1" },
  rolePill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  roleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  devBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.light.gold,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.light.gold + "15",
  },
  devBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.light.gold },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, paddingHorizontal: 4, marginTop: 6 },
  settingsGroup: { gap: 2, borderRadius: 14, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 0 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  version: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
});
