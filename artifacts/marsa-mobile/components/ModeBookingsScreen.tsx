import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ListMyBookingsRole,
  useConfirmBooking,
  useListMyBookings,
  useRejectBooking,
} from "@workspace/api-client-react";

import { BookingCard } from "@/components/BookingCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonBookingCard } from "@/components/SkeletonCard";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";

type BookingMode = "guest" | "host";

const ACTIVE_STATUSES = [
  "pending_payment",
  "paid_under_review",
  "confirmed",
  "cancel_requested",
];
const FINISHED_STATUSES = [
  "completed",
  "closed",
  "cancelled",
  "rejected_refunded",
];

export function ModeBookingsScreen({ mode }: { mode: BookingMode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const [segment, setSegment] = useState<"active" | "past">("active");
  const [refreshing, setRefreshing] = useState(false);

  const role =
    mode === "host" ? ListMyBookingsRole.host : ListMyBookingsRole.guest;
  const query = useListMyBookings({ role });
  const confirm = useConfirmBooking();
  const reject = useRejectBooking();
  const bookings: any[] = (query.data as any)?.bookings ?? [];

  const displayed = useMemo(
    () =>
      bookings.filter((booking) =>
        segment === "active"
          ? ACTIVE_STATUSES.includes(booking.status)
          : FINISHED_STATUSES.includes(booking.status),
      ),
    [bookings, segment],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const title = mode === "host" ? "Guest Bookings" : "My Bookings";
  const activeLabel = mode === "host" ? "Incoming" : "Upcoming";
  const topPad = Platform.OS === "web" ? 24 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {mode === "host" ? "HOST MODE" : "GUEST MODE"}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {title}
          </Text>
        </View>
        <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
          {[
            { key: "active" as const, label: activeLabel },
            { key: "past" as const, label: "Past" },
          ].map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setSegment(item.key)}
              style={[
                styles.segment,
                segment === item.key && { backgroundColor: colors.card },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color:
                      segment === item.key
                        ? colors.foreground
                        : colors.mutedForeground,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((item) => (
            <SkeletonBookingCard key={item} />
          ))}
        </View>
      ) : query.error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load bookings"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={mode === "host" ? "calendar-clear-outline" : "boat-outline"}
          title={
            mode === "host"
              ? segment === "active"
                ? "No incoming bookings"
                : "No completed bookings yet"
              : segment === "active"
                ? "No upcoming trips"
                : "No past trips yet"
          }
          subtitle={
            mode === "guest" && segment === "active"
              ? "Explore available yachts and plan your next day on the water."
              : undefined
          }
          actionLabel={
            mode === "guest" && segment === "active"
              ? "Explore Yachts"
              : undefined
          }
          onAction={
            mode === "guest" && segment === "active"
              ? () => router.replace("/(home)/guest/(tabs)/explore" as any)
              : undefined
          }
        />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 88 },
          ]}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              onPress={() => router.push(`/(home)/booking/${item.id}`)}
              showActions={
                mode === "host" &&
                segment === "active" &&
                item.status === "paid_under_review"
              }
              onConfirm={async () => {
                await confirm.mutateAsync({ id: item.id });
                await query.refetch();
              }}
              onReject={async () => {
                await reject.mutateAsync({ id: item.id });
                await query.refetch();
              }}
              showLeaveReview={
                mode === "guest" &&
                segment === "past" &&
                item.status === "completed" &&
                !item.hasReview &&
                item.guestId === user?.id
              }
              onLeaveReview={() => router.push(`/(home)/review/${item.id}`)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
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
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 25 },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8,
  },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  list: { padding: 16 },
});
