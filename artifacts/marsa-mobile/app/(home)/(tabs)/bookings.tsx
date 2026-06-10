import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListMyBookings,
  useConfirmBooking,
  useRejectBooking,
  ListMyBookingsRole,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { BookingCard } from "@/components/BookingCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonBookingCard } from "@/components/SkeletonCard";
import colors from "@/constants/colors";

const STATUSES = ["all", "pending", "confirmed", "completed", "cancelled"];

export default function BookingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isHost, user } = useUser();

  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  // Hosts see all their bookings (as guest + incoming) in one unified list
  const role = isHost ? ListMyBookingsRole.all : ListMyBookingsRole.guest;

  const { data, isLoading, error, refetch } = useListMyBookings({
    role,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: 1,
  });

  const bookings = (data as any)?.bookings ?? [];

  const confirm = useConfirmBooking();
  const reject = useRejectBooking();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.foreground }]}>My Bookings</Text>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUSES}
          keyExtractor={(s) => s}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.statusChip,
                statusFilter === item
                  ? { backgroundColor: colors.light.navy }
                  : { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 },
              ]}
              onPress={() => setStatusFilter(item)}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: statusFilter === item ? "#fff" : c.mutedForeground },
                ]}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          style={{ marginTop: 4 }}
        />
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => <SkeletonBookingCard key={i} />)}
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load bookings"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No bookings yet"
          subtitle="Explore yachts and make your first booking"
          actionLabel="Explore Yachts"
          onAction={() => router.replace("/(home)/(tabs)/explore")}
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            // For hosts: show quick actions on incoming bookings (where user is not the guest)
            const isIncoming = isHost && item.guestId !== user?.id;
            return (
              <BookingCard
                booking={item}
                onPress={() => router.push(`/(home)/booking/${item.id}`)}
                showActions={isIncoming}
                onConfirm={() =>
                  confirm.mutateAsync({ id: item.id }).catch(() => {}).then(() => refetch())
                }
                onReject={() =>
                  reject.mutateAsync({ id: item.id }).catch(() => {}).then(() => refetch())
                }
              />
            );
          }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  statusChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { padding: 16 },
});
