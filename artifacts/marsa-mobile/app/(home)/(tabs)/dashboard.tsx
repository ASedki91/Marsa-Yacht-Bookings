import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetHostEarnings,
  useListMyBookings,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import colors from "@/constants/colors";

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={[
        sStyles.card,
        {
          backgroundColor: accent ? colors.light.navy : c.card,
          borderColor: accent ? colors.light.navy : c.border,
        },
      ]}
    >
      <Ionicons
        name={icon as any}
        size={22}
        color={accent ? colors.light.gold : c.primary}
      />
      <Text style={[sStyles.value, { color: accent ? "#fff" : c.foreground }]}>
        {value}
      </Text>
      <Text
        style={[
          sStyles.label,
          { color: accent ? "#CBD5E1" : c.mutedForeground },
        ]}
      >
        {label}
      </Text>
      {sub && (
        <Text
          style={[
            sStyles.sub,
            { color: accent ? colors.light.gold : c.primary },
          ]}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}

const sStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    alignItems: "flex-start",
    minHeight: 100,
  },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sub: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
});

function BookingRow({
  booking,
  onPress,
}: {
  booking: any;
  onPress: () => void;
}) {
  const c = useColors();
  const statusColors: Record<string, string> = {
    pending_payment: "#F59E0B",
    paid_under_review: "#3B82F6",
    confirmed: "#22C55E",
    completed: "#3B82F6",
    cancel_requested: "#F97316",
    cancelled: "#EF4444",
    rejected_refunded: "#6B7280",
  };
  const status = booking.status ?? "pending";
  return (
    <Pressable
      style={[bStyles.row, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={onPress}
    >
      <View
        style={[
          bStyles.dot,
          { backgroundColor: statusColors[status] ?? c.muted },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[bStyles.guest, { color: c.foreground }]}
          numberOfLines={1}
        >
          {booking.guestName ?? "Guest"}
        </Text>
        <Text
          style={[bStyles.yacht, { color: c.mutedForeground }]}
          numberOfLines={1}
        >
          {booking.yacht?.title ?? booking.yacht?.name ?? "Yacht"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <View
          style={[
            bStyles.badge,
            { backgroundColor: (statusColors[status] ?? "#6B7280") + "20" },
          ]}
        >
          <Text
            style={[
              bStyles.badgeText,
              { color: statusColors[status] ?? c.mutedForeground },
            ]}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
        <Text style={[bStyles.amount, { color: c.foreground }]}>
          EGP {Number(booking.totalAmountEgp ?? 0).toLocaleString("en-EG")}
        </Text>
      </View>
    </Pressable>
  );
}

const bStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  guest: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  yacht: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  amount: { fontSize: 13, fontFamily: "Inter_700Bold" },
});

export default function DashboardScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: profile } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: earningsData,
    isLoading: earningsLoading,
    refetch: refetchEarnings,
  } = useGetHostEarnings();
  const {
    data: bookingsData,
    isLoading: bookingsLoading,
    refetch: refetchBookings,
  } = useListMyBookings({ role: "host", page: 1 });

  const earnings = (earningsData as any) ?? null;
  const allBookings = (bookingsData as any)?.bookings ?? [];
  const pendingBookings = allBookings.filter(
    (booking: any) => booking.status === "paid_under_review",
  );
  const recentBookings = allBookings.slice(0, 5);
  const totalBookings = Number(
    (bookingsData as any)?.total ?? allBookings.length,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchEarnings(), refetchBookings()]);
    setRefreshing(false);
  }, [refetchEarnings, refetchBookings]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const isLoading = earningsLoading || bookingsLoading;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 12, paddingBottom: insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.primary}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: c.mutedForeground }]}>
            Host Dashboard
          </Text>
          <Text style={[styles.name, { color: c.foreground }]}>
            {profile?.name ? `Hello, ${profile.name.split(" ")[0]}` : "MARSA"}
          </Text>
        </View>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.light.navy }]}
          onPress={() => router.push("/(home)/new-yacht")}
        >
          <Ionicons name="add" size={20} color={colors.light.gold} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard
              icon="cash-outline"
              label="Available Balance"
              value={`EGP ${earnings?.availableEgp ?? "0"}`}
              sub="Ready to withdraw"
              accent
            />
            <StatCard
              icon="time-outline"
              label="Pending Balance"
              value={`EGP ${earnings?.pendingEgp ?? "0"}`}
              sub="Clearing soon"
            />
          </View>
          <View style={styles.statsGrid}>
            <StatCard
              icon="calendar-outline"
              label="Pending Bookings"
              value={String(pendingBookings.length)}
              sub={pendingBookings.length > 0 ? "Needs action" : "All clear"}
            />
            <StatCard
              icon="checkmark-circle-outline"
              label="Total Bookings"
              value={String(totalBookings)}
            />
          </View>

          {pendingBookings.length > 0 && (
            <View
              style={[
                styles.alertBanner,
                { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" },
              ]}
            >
              <Ionicons name="alert-circle" size={18} color="#D97706" />
              <Text style={[styles.alertText, { color: "#92400E" }]}>
                You have {pendingBookings.length} booking
                {pendingBookings.length > 1 ? "s" : ""} awaiting your
                confirmation.
              </Text>
              <Pressable
                onPress={() =>
                  router.push("/(home)/host/(tabs)/bookings" as any)
                }
              >
                <Text style={[styles.alertLink, { color: "#D97706" }]}>
                  Review →
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>
                Recent Bookings
              </Text>
              <Pressable
                onPress={() =>
                  router.push("/(home)/host/(tabs)/bookings" as any)
                }
              >
                <Text style={[styles.seeAll, { color: c.primary }]}>
                  See all
                </Text>
              </Pressable>
            </View>
            {recentBookings.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={32}
                  color={c.mutedForeground}
                />
                <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                  No bookings yet
                </Text>
                <Text style={[styles.emptySub, { color: c.mutedForeground }]}>
                  Once guests book your yachts, they'll appear here
                </Text>
              </View>
            ) : (
              <View style={styles.bookingList}>
                {recentBookings.map((b: any) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onPress={() => router.push(`/(home)/booking/${b.id}`)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              Quick Actions
            </Text>
            <View style={styles.actionsGrid}>
              {[
                {
                  icon: "boat-outline",
                  label: "My Yachts",
                  route: "/(home)/host/(tabs)/yachts",
                },
                {
                  icon: "add-circle-outline",
                  label: "List Yacht",
                  route: "/(home)/new-yacht" as const,
                },
                {
                  icon: "cash-outline",
                  label: "Earnings",
                  route: "/(home)/host/(tabs)/earnings",
                },
                {
                  icon: "person-outline",
                  label: "Profile",
                  route: "/(home)/host/(tabs)/profile",
                },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  style={[
                    styles.actionCard,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                  onPress={() => router.push(action.route as any)}
                >
                  <Ionicons
                    name={action.icon as any}
                    size={22}
                    color={c.primary}
                  />
                  <Text style={[styles.actionLabel, { color: c.foreground }]}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  name: { fontSize: 24, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  statsGrid: { flexDirection: "row", gap: 12 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  alertLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bookingList: { gap: 8 },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionCard: {
    width: "47%",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  feeNote: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  feeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});
