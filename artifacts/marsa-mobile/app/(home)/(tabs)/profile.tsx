import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert,
  ActivityIndicator, Linking, TextInput, Modal, KeyboardAvoidingView,
} from "react-native";
import { useClerk, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { API_BASE_URL } from "@/lib/env";
import colors from "@/constants/colors";

const WHATSAPP_NUMBER = "201030303030";

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
  const { user, isHost, isAdmin, refetch } = useUser();

  const [hostLoading, setHostLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const openEditModal = () => {
    setEditName(user?.name ?? "");
    setEditPhone((user as any)?.phone ?? "");
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: editName.trim(),
          phone: editPhone.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Update Failed", data.error ?? "Could not save your profile.");
        return;
      }
      await refetch();
      setShowEditModal(false);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Network error");
    } finally {
      setSaving(false);
    }
  };

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
      const res = await fetch(`${API_BASE_URL}/api/dev/become-host`, {
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
        .replace(/\+.*$/, "")
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : "";
  const displayName = user?.name?.trim() || emailName || "MARSA User";

  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const roleBadge = isAdmin ? "Admin" : isHost ? "Host & Guest" : "Guest";
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

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>PROFILE</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="person-outline"
            label="Edit Profile"
            value={displayName !== "MARSA User" ? displayName : undefined}
            onPress={openEditModal}
          />
          {(user as any)?.phone ? (
            <SettingRow
              icon="call-outline"
              label="Phone"
              value={(user as any).phone}
              onPress={openEditModal}
            />
          ) : (
            <SettingRow
              icon="call-outline"
              label="Add Phone Number"
              onPress={openEditModal}
            />
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>GUEST</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="receipt-outline"
            label="My Bookings"
            onPress={() => router.push("/(home)/(tabs)/bookings")}
          />
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
        </View>

        {isHost && (
          <>
            <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>HOST</Text>
            <View style={styles.settingsGroup}>
              <SettingRow
                icon="boat-outline"
                label="My Yachts"
                badge="Active"
                iconColor={colors.light.ocean}
                onPress={() => router.push("/(home)/(tabs)/yachts")}
              />
              <SettingRow
                icon="calendar-outline"
                label="Incoming Bookings"
                onPress={() => router.push("/(home)/(tabs)/dashboard")}
              />
              <SettingRow
                icon="cash-outline"
                label="Earnings"
                onPress={() => router.push("/(home)/(tabs)/earnings")}
              />
            </View>
          </>
        )}

        {isAdmin && (
          <>
            <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>ADMIN</Text>
            <View style={styles.settingsGroup}>
              <SettingRow
                icon="shield-checkmark-outline"
                label="Admin Panel"
                iconColor="#7C3AED"
                onPress={() => Alert.alert("Admin Panel", "Access the admin dashboard from a web browser.")}
              />
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>SUPPORT & LEGAL</Text>
        <View style={styles.settingsGroup}>
          <SettingRow
            icon="logo-whatsapp"
            label="WhatsApp Support"
            iconColor="#22C55E"
            onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20need%20help%20with%20MARSA`).catch(() =>
              Alert.alert("WhatsApp", "Could not open WhatsApp. Please contact support@marsa.app")
            )}
          />
          <SettingRow
            icon="information-circle-outline"
            label="About MARSA"
            onPress={() => Alert.alert("MARSA", "El Gouna's premier yacht charter marketplace.\n\nVersion 1.0.0")}
          />
          <SettingRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => router.push("/legal/privacy" as any)}
          />
          <SettingRow
            icon="document-text-outline"
            label="Terms of Use"
            onPress={() => router.push("/legal/terms" as any)}
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

      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: c.background }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <Pressable onPress={() => setShowEditModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={22} color={c.foreground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>Edit Profile</Text>
            <Pressable
              onPress={handleSaveProfile}
              disabled={saving}
              style={[styles.modalSaveBtn, { opacity: saving ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.light.ocean} />
              ) : (
                <Text style={[styles.modalSaveText, { color: colors.light.ocean }]}>Save</Text>
              )}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.modalField, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.modalFieldLabel, { color: c.mutedForeground }]}>Full Name</Text>
              <TextInput
                style={[styles.modalFieldInput, { color: c.foreground }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={[styles.modalField, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.modalFieldLabel, { color: c.mutedForeground }]}>Email</Text>
              <Text style={[styles.modalFieldStatic, { color: c.foreground }]}>{user?.email ?? ""}</Text>
              <Text style={[styles.modalFieldNote, { color: c.mutedForeground }]}>Managed by your sign-in account</Text>
            </View>

            <View style={[styles.modalField, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.modalFieldLabel, { color: c.mutedForeground }]}>Phone Number</Text>
              <TextInput
                style={[styles.modalFieldInput, { color: c.foreground }]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+20 100 000 0000"
                placeholderTextColor={c.mutedForeground}
                keyboardType="phone-pad"
                returnKeyType="done"
              />
            </View>

            <Pressable
              style={[styles.saveBtnFull, { backgroundColor: colors.light.navy, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSaveProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnFullText}>Save Changes</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  avatarInitials: { fontSize: 28, fontFamily: "HankenGrotesk_700Bold", color: "#fff" },
  avatarName: { fontSize: 20, fontFamily: "HankenGrotesk_700Bold", color: "#fff" },
  avatarEmail: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", color: "#CBD5E1" },
  rolePill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  roleText: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold" },
  devBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.light.gold,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.light.gold + "15",
  },
  devBtnText: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold", color: colors.light.gold },
  sectionLabel: { fontSize: 11, fontFamily: "SpaceMono_700Bold", letterSpacing: 1, paddingHorizontal: 4, marginTop: 6 },
  settingsGroup: { gap: 2, borderRadius: 14, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "HankenGrotesk_400Regular" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingValue: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "HankenGrotesk_600SemiBold" },
  version: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", textAlign: "center", marginTop: 8 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalClose: { padding: 4 },
  modalTitle: { fontSize: 17, fontFamily: "Marcellus_400Regular" },
  modalSaveBtn: { padding: 4 },
  modalSaveText: { fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold" },
  modalContent: { padding: 16, gap: 12 },
  modalField: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  modalFieldLabel: { fontSize: 11, fontFamily: "HankenGrotesk_600SemiBold", letterSpacing: 0.5 },
  modalFieldInput: { fontSize: 16, fontFamily: "HankenGrotesk_400Regular", paddingVertical: 4 },
  modalFieldStatic: { fontSize: 16, fontFamily: "HankenGrotesk_400Regular", paddingVertical: 4 },
  modalFieldNote: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  saveBtnFull: {
    borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8,
  },
  saveBtnFullText: { color: "#fff", fontSize: 16, fontFamily: "HankenGrotesk_700Bold" },
});
