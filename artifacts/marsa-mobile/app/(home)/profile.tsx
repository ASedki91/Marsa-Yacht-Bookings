import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useClerk, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { usePushNotifications } from "@/contexts/PushNotificationsContext";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { getClerkErrorMessage } from "@/lib/clerkAuth";
import { devBypass } from "@/lib/devBypass";
import { API_BASE_URL } from "@/lib/env";
import colors from "@/constants/colors";

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  iconColor?: string;
}

function SettingRow({ icon, label, value, onPress, danger, iconColor }: SettingRowProps) {
  const c = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingRow,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: (iconColor ?? c.primary) + "15" }]}>
        <Ionicons name={icon} size={20} color={iconColor ?? c.primary} />
      </View>
      <Text style={[styles.settingLabel, { color: danger ? c.destructive : c.foreground }]}>
        {label}
      </Text>
      <View style={styles.settingRight}>
        {value && <Text style={[styles.settingValue, { color: c.mutedForeground }]}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

interface EditFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
}

function EditField({ label, value, onChangeText, placeholder, keyboardType = "default", autoCapitalize = "words" }: EditFieldProps) {
  const c = useColors();
  return (
    <View style={styles.editField}>
      <Text style={[styles.editLabel, { color: c.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.editInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType="next"
      />
    </View>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const router = useRouter();
  const { user, isHost, isAdmin, refetch } = useUser();
  const pushNotifications = usePushNotifications();

  // Sign-out state
  const [showSignOut, setShowSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNationality, setEditNationality] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Avatar upload state
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleStartEditing = () => {
    setEditName(user?.name ?? "");
    setEditPhone(user?.phone ?? "");
    setEditNationality(user?.nationality ?? "");
    setLocalAvatarUri(null);
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setLocalAvatarUri(null);
    setIsEditing(false);
    setSaveError(null);
  };

  const handlePickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSaveError("Photo library access is required to change your avatar.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        setLocalAvatarUri(result.assets[0].uri);
        setSaveError(null);
      }
    } catch {
      setSaveError("Could not open photo library. Please try again.");
    }
  };

  /** Upload localAvatarUri via two-step GCS flow and return the public URL. */
  const uploadAvatarAndGetUrl = async (localUri: string, token: string | null): Promise<string> => {
    setIsUploadingAvatar(true);
    try {
      // Determine content type from URI extension
      const ext = localUri.split(".").pop()?.toLowerCase() ?? "jpg";
      const contentTypeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        heic: "image/heic",
      };
      const contentType = contentTypeMap[ext] ?? "image/jpeg";
      const fileName = `avatar.${ext}`;

      // Fetch the image as a blob for size + upload
      const imageResponse = await fetch(localUri);
      const blob = await imageResponse.blob();

      // Step 1: Request a presigned upload URL
      const urlRes = await fetch(`${API_BASE_URL}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: fileName, size: blob.size, contentType }),
      });
      if (!urlRes.ok) throw new Error("Failed to request upload URL.");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: Upload binary directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image.");

      // Step 3: Finalize — set public ACL so the image can be served without auth
      const finalizeRes = await fetch(`${API_BASE_URL}/api/storage/uploads/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ objectPath, visibility: "public" }),
      });
      if (!finalizeRes.ok) throw new Error("Failed to finalize upload.");

      // Build the public URL (strip leading /objects/ prefix for the endpoint path)
      const finalizedPath = (await finalizeRes.json()).objectPath as string;
      const objectId = finalizedPath.replace(/^\/objects\//, "");
      return `${API_BASE_URL}/api/storage/public-uploads/${objectId}`;
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const token = await getToken();
      const body: Record<string, string> = {};
      if (editName.trim()) body.fullName = editName.trim();
      if (editPhone.trim()) body.phone = editPhone.trim();
      if (editNationality.trim()) body.nationality = editNationality.trim();

      // Upload avatar if a new one was picked
      if (localAvatarUri) {
        body.avatarUrl = await uploadAvatarAndGetUrl(localAvatarUri, token);
      }

      const res = await fetch(`${API_BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message ?? "Could not save profile.");
      }

      refetch();
      setLocalAvatarUri(null);
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err?.message ?? "Could not save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    setSignOutError(null);
    setShowSignOut(true);
  };

  const confirmSignOut = async () => {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      try {
        await pushNotifications.deactivate();
      } catch (notificationError) {
        console.warn("Push token cleanup failed during sign-out.", notificationError);
      }
      await signOut();
      devBypass.disable();
      setShowSignOut(false);
      router.replace("/(auth)/sign-in");
    } catch (clerkError: unknown) {
      setSignOutError(
        getClerkErrorMessage(
          clerkError,
          "Sign out could not be completed. Check your connection and try again.",
        ),
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ backgroundColor: c.background }}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Edit header */}
          <View style={styles.editHeader}>
            <Pressable onPress={handleCancelEditing} style={styles.editHeaderBtn}>
              <Text style={[styles.editHeaderBtnText, { color: c.mutedForeground }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.editTitle, { color: c.foreground }]}>Edit Profile</Text>
            <Pressable
              onPress={handleSaveProfile}
              disabled={isSaving}
              style={[styles.editHeaderBtn, { opacity: isSaving ? 0.5 : 1 }]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <Text style={[styles.editHeaderBtnText, { color: c.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          {/* Avatar — tappable to change photo */}
          <Pressable
            onPress={handlePickAvatar}
            disabled={isUploadingAvatar || isSaving}
            style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.avatarWrapper}>
              {localAvatarUri ? (
                <Image source={{ uri: localAvatarUri }} style={styles.avatarImage} />
              ) : user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.light.navy }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </View>
          </Pressable>

          {/* Error */}
          {saveError ? (
            <View style={[styles.errorBox, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : null}

          {/* Edit fields */}
          <View style={[styles.editCard, { borderColor: c.border }]}>
            <EditField
              label="Full Name"
              value={editName}
              onChangeText={setEditName}
              placeholder="Your full name"
              autoCapitalize="words"
            />
            <View style={[styles.fieldSeparator, { backgroundColor: c.border }]} />
            <EditField
              label="Phone"
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+20 100 000 0000"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <View style={[styles.fieldSeparator, { backgroundColor: c.border }]} />
            <EditField
              label="Nationality"
              value={editNationality}
              onChangeText={setEditNationality}
              placeholder="e.g. Egyptian"
              autoCapitalize="words"
            />
          </View>

          {/* Read-only info */}
          <View style={[styles.editCard, { borderColor: c.border }]}>
            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: c.mutedForeground }]}>Email</Text>
              <Text style={[styles.editReadOnly, { color: c.mutedForeground }]}>{user?.email}</Text>
            </View>
            <View style={[styles.fieldSeparator, { backgroundColor: c.border }]} />
            <View style={styles.editField}>
              <Text style={[styles.editLabel, { color: c.mutedForeground }]}>Role</Text>
              <Text style={[styles.editReadOnly, { color: c.mutedForeground }]}>
                {isAdmin ? "Admin" : isHost ? "Host" : "Guest"}
              </Text>
            </View>
          </View>

          <Text style={[styles.editHint, { color: c.mutedForeground }]}>
            Your phone number will be pre-filled on new bookings.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 32 }]}
    >
      {user?.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.light.navy }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}

      <Text style={[styles.name, { color: c.foreground }]}>
        {user?.name ?? "Guest User"}
      </Text>
      <Text style={[styles.email, { color: c.mutedForeground }]}>
        {user?.email ?? ""}
      </Text>
      {user?.phone ? (
        <Text style={[styles.phone, { color: c.mutedForeground }]}>
          {user.phone}
        </Text>
      ) : null}

      <View style={styles.roleBadgeRow}>
        <View
          style={[
            styles.roleBadge,
            {
              backgroundColor: isAdmin
                ? "#EDE9FE"
                : isHost
                ? colors.light.goldLight
                : c.muted,
            },
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              { color: isAdmin ? "#7C3AED" : isHost ? "#92400E" : c.mutedForeground },
            ]}
          >
            {isAdmin ? "Admin" : isHost ? "Host" : "Guest"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>Account</Text>
        <View style={[styles.card, { borderColor: c.border }]}>
          <SettingRow
            icon="person-outline"
            label="Edit Profile"
            iconColor={c.primary}
            onPress={handleStartEditing}
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <SettingRow
            icon="notifications-outline"
            label="Notifications"
            iconColor="#F59E0B"
            onPress={() => router.push("/(home)/notifications")}
          />
          {!isHost && (
            <>
              <View style={[styles.separator, { backgroundColor: c.border }]} />
              <SettingRow
                icon="boat-outline"
                label="Become a Host"
                iconColor="#10B981"
                value="Earn with MARSA"
                onPress={() => router.push("/(home)/become-host" as any)}
              />
            </>
          )}
        </View>
      </View>

      {isHost && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>Hosting</Text>
          <View style={[styles.card, { borderColor: c.border }]}>
            <SettingRow
              icon="boat-outline"
              label="My Yachts"
              iconColor={colors.light.ocean}
              onPress={() => router.replace("/(home)/host/(tabs)/yachts" as any)}
            />
            <View style={[styles.separator, { backgroundColor: c.border }]} />
            <SettingRow
              icon="cash-outline"
              label="Earnings"
              iconColor="#10B981"
              onPress={() => router.replace("/(home)/host/(tabs)/earnings" as any)}
            />
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>Support</Text>
        <View style={[styles.card, { borderColor: c.border }]}>
          <SettingRow
            icon="help-circle-outline"
            label="Help & FAQ"
            iconColor="#6366F1"
            onPress={() => {}}
          />
          <View style={[styles.separator, { backgroundColor: c.border }]} />
          <SettingRow
            icon="document-text-outline"
            label="Terms & Privacy"
            iconColor={c.mutedForeground}
            onPress={() => {}}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={[styles.card, { borderColor: c.border }]}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            danger
            onPress={handleSignOut}
          />
        </View>
      </View>

      <Text style={[styles.version, { color: c.mutedForeground }]}>MARSA v1.0.0</Text>

      <ConfirmActionModal
        visible={showSignOut}
        title="Sign out of MARSA?"
        message="You can sign back in at any time with your email, email code, or Google account."
        confirmLabel="Sign out"
        destructive
        loading={isSigningOut}
        error={signOutError}
        onCancel={() => {
          setSignOutError(null);
          setShowSignOut(false);
        }}
        onConfirm={confirmSignOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingHorizontal: 16, paddingTop: 24, gap: 4 },

  // View mode
  avatarWrapper: { position: "relative", marginBottom: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#1e40af",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  email: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
  roleBadgeRow: { flexDirection: "row", justifyContent: "center", marginTop: 6, marginBottom: 12 },
  roleBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100 },
  roleBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { width: "100%", gap: 8 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingLeft: 4 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  settingValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  separator: { height: 1, marginLeft: 62 },
  version: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 20 },

  // Edit mode
  editHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingVertical: 4, marginBottom: 16 },
  editHeaderBtn: { minWidth: 60, alignItems: "center", paddingVertical: 6 },
  editHeaderBtnText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  editTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  editCard: { width: "100%", borderRadius: 14, borderWidth: 1, overflow: "hidden", marginTop: 8 },
  editField: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  editLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  editInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular" },
  editReadOnly: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  fieldSeparator: { height: 1, marginHorizontal: 16 },
  editHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, paddingHorizontal: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, width: "100%", marginBottom: 4 },
  errorText: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
});
