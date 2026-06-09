import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
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
      <Text
        style={[styles.settingLabel, { color: danger ? c.destructive : c.foreground }]}
      >
        {label}
      </Text>
      <View style={styles.settingRight}>
        {value && <Text style={[styles.settingValue, { color: c.mutedForeground }]}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const router = useRouter();
  const { user, isHost, isAdmin } = useUser();

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

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 32 }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.light.navy }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <Text style={[styles.name, { color: c.foreground }]}>
        {user?.name ?? "Guest User"}
      </Text>
      <Text style={[styles.email, { color: c.mutedForeground }]}>
        {user?.email ?? ""}
      </Text>

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
              {
                color: isAdmin ? "#7C3AED" : isHost ? "#92400E" : c.mutedForeground,
              },
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
            onPress={() => Alert.alert("Coming Soon", "Profile editing is available on the web dashboard.")}
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
                onPress={() => Alert.alert("Become a Host", "Visit marsa.app on web to apply as a yacht host.")}
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
              onPress={() => router.replace("/(home)/(tabs)/yachts")}
            />
            <View style={[styles.separator, { backgroundColor: c.border }]} />
            <SettingRow
              icon="cash-outline"
              label="Earnings"
              iconColor="#10B981"
              onPress={() => router.replace("/(home)/(tabs)/earnings")}
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
            onPress={() => Alert.alert("Help", "Visit marsa.app/help for support.")}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingHorizontal: 16, paddingTop: 24, gap: 4 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  email: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
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
});
