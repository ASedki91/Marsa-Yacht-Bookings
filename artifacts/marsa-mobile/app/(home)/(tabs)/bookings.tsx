import React, { useCallback, useMemo, useState } from "react";
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

const UPCOMING_STATUSES = ["pending_payment", "paid_under_review", "confirmed"];
const PAST_STATUSES = ["completed", "cancelled", "rejected_refunded", "cancel_requested"];

export default function BookingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isHost, user } = useUser();

  const [view, setView] = useState(isHost ? "incoming" : "upcoming");
  const [refreshing, setRefreshing] = useState(false);

  const guestQuery = useListMyBookings({ role: ListMyBookingsRole.guest });
  const hostQuery = useListMyBookings({ role: ListMyBookingsRole.host });

  const allGuestBookings: any[] = (guestQuery.data as any)?.bookings ?? [];
  const allHostBookings: any[] = (hostQuery.data as any)?.bookings ?? [];

  const displayBookings = useMemo(() => {
    if (!isHost) {
      if (view === "upcoming") {
        return allGuestBookings.filter((b) => UPCOMING_STATUSES.includes(b.status));
      }
      return allGuestBookings.filter((b) => PAST_STATUSES.includes(b.status));
    }
    if (view === "incoming") return allHostBookings;
    return allGuestBookings;
  }, [view, allGuestBookings, allHostBookings, isHost]);

  const isLoading =
    view === "incoming" ? hostQuery.isLoading : guestQuery.isLoading;

  const confirm = useConfirmBooking();
  const reject = useRejectBooking();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([guestQuery.refetch(), hostQuery.refetch()]);
    setRefreshing(false);
  }, [guestQuery, hostQuery]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const TABS = isHost
    ? [
        { key: "incoming", label: "Incoming" },
        { key: "my_trips", label: "My Trips" },
      ]
    : [
        { key: "upcoming", label: "Upcoming" },
        { key: "past", label: "Past" },
      ];

  const emptyTitle = (() => {
    if (view === "upcoming") return "No upcoming bookings";
    if (view === "past") return "No past bookings";
    if (view === "incoming") return "No incoming bookings";
    return "No trips yet";
  })();

  const emptySubtitle =
    view === "upcoming" || view === "past"
      ? "Explore yachts and make your first booking"
      : undefined;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: c.foreground }]}>My Bookings</Text>

        <View style={[styles.segmented, { backgroundColor: c.muted }]}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.segTab,
                view === tab.key && {
                  backgroundColor: c.card,
                  shadowColor: "#000",
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                },
              ]}
              onPress={() => setView(tab.key)}
            >
              <Text
                style={[
                  styles.segTabText,
                  {
                    color: view === tab.key ? c.foreground : c.mutedForeground,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => (
            <SkeletonBookingCard key={i} />
          ))}
        </View>
      ) : displayBookings.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={emptyTitle}
          subtitle={emptySubtitle}
          actionLabel={view === "upcoming" ? "Explore Yachts" : undefined}
          onAction={
            view === "upcoming"
              ? () => router.replace("/(home)/(tabs)/explore")
              : undefined
          }
        />
      ) : (
        <FlatList
          data={displayBookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isIncoming = view === "incoming";
            const isPastGuest = !isHost && view === "past";
            return (
              <BookingCard
                booking={item}
                onPress={() => router.push(`/(home)/booking/${item.id}`)}
                showActions={isIncoming}
                onConfirm={() =>
                  confirm
                    .mutateAsync({ id: item.id })
                    .catch(() => {})
                    .then(() =>
                      Promise.all([guestQuery.refetch(), hostQuery.refetch()])
                    )
                }
                onReject={() =>
                  reject
                    .mutateAsync({ id: item.id })
                    .catch(() => {})
                    .then(() =>
                      Promise.all([guestQuery.refetch(), hostQuery.refetch()])
                    )
                }
                showLeaveReview={
                  isPastGuest &&
                  item.status === "completed" &&
                  !item.hasReview &&
                  item.guestId === user?.id
                }
                onLeaveReview={() => router.push(`/(home)/review/${item.id}`)}
              />
            );
          }}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom:
                Platform.OS === "web" ? 34 : insets.bottom + 80,
            },
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
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  segmented: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  segTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  segTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16 },
});
