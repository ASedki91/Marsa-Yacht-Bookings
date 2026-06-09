import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetBooking,
  useCancelBooking,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Pending", color: "#92400E", bg: "#FEF3C7", icon: "time-outline" },
  confirmed: { label: "Confirmed", color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  completed: { label: "Completed", color: "#1E40AF", bg: "#DBEAFE", icon: "trophy-outline" },
  cancelled: { label: "Cancelled", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
  rejected: { label: "Rejected", color: "#991B1B", bg: "#FEE2E2", icon: "ban-outline" },
};

const TIMELINE_STEPS = [
  { key: "pending", label: "Booking Requested", sub: "Waiting for host confirmation" },
  { key: "confirmed", label: "Booking Confirmed", sub: "Host has accepted your booking" },
  { key: "completed", label: "Trip Completed", sub: "Your charter is complete" },
];

function Timeline({ status }: { status: string }) {
  const c = useColors();
  const cancelled = status === "cancelled" || status === "rejected";

  return (
    <View style={tlStyles.container}>
      <Text style={[tlStyles.heading, { color: c.foreground }]}>Booking Timeline</Text>
      {cancelled ? (
        <View style={[tlStyles.cancelledBox, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
          <Ionicons name="close-circle-outline" size={20} color="#991B1B" />
          <Text style={[tlStyles.cancelledText, { color: "#991B1B" }]}>
            This booking has been {status}.
          </Text>
        </View>
      ) : (
        TIMELINE_STEPS.map((step, i) => {
          const isDone =
            status === "completed" ? true
              : status === "confirmed" ? i <= 1
                : i === 0;
          const isCurrent =
            status === "pending" && i === 0
              ? true
              : status === "confirmed" && i === 1
                ? true
                : status === "completed" && i === 2;

          return (
            <View key={step.key} style={tlStyles.stepRow}>
              <View style={tlStyles.leftCol}>
                <View
                  style={[
                    tlStyles.dot,
                    {
                      backgroundColor: isDone ? colors.light.navy : c.muted,
                      borderColor: isCurrent ? colors.light.ocean : "transparent",
                      borderWidth: isCurrent ? 2 : 0,
                    },
                  ]}
                >
                  {isDone && <Ionicons name="checkmark" size={10} color="#fff" />}
                </View>
                {i < TIMELINE_STEPS.length - 1 && (
                  <View style={[tlStyles.line, { backgroundColor: isDone ? colors.light.navy : c.muted }]} />
                )}
              </View>
              <View style={tlStyles.textCol}>
                <Text style={[tlStyles.stepLabel, { color: isDone ? c.foreground : c.mutedForeground }]}>
                  {step.label}
                </Text>
                <Text style={[tlStyles.stepSub, { color: c.mutedForeground }]}>{step.sub}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const tlStyles = StyleSheet.create({
  container: { gap: 0 },
  heading: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stepRow: { flexDirection: "row", gap: 12 },
  leftCol: { alignItems: "center", width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, minHeight: 32, marginVertical: 4 },
  textCol: { paddingBottom: 24, flex: 1 },
  stepLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stepSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cancelledBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  cancelledText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
});

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: any }) {
  const c = useColors();
  return (
    <View style={[dtStyles.row, { borderBottomColor: c.border }]}>
      <View style={dtStyles.rowLeft}>
        {icon && <Ionicons name={icon} size={16} color={c.mutedForeground} />}
        <Text style={[dtStyles.label, { color: c.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[dtStyles.value, { color: c.foreground }]}>{value}</Text>
    </View>
  );
}

const dtStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular" },
  value: { fontSize: 14, fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },
});

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isHost } = useUser();
  const [cancelLoading, setCancelLoading] = useState(false);

  const { data, isLoading, error } = useGetBooking(id!);
  const cancelBooking = useCancelBooking();

  const booking = (data as any) ?? null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCancel = () => {
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking? This action cannot be undone.",
      [
        { text: "Keep Booking", style: "cancel" },
        {
          text: "Cancel Booking",
          style: "destructive",
          onPress: async () => {
            setCancelLoading(true);
            try {
              await cancelBooking.mutateAsync({ id: id! });
              Alert.alert("Cancelled", "Your booking has been cancelled.");
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err?.errors?.[0]?.message ?? "Could not cancel booking.");
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ]
    );
  };

  const goToReview = () => {
    router.push(`/(home)/review/${id}`);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (error || !booking) {
    return <EmptyState icon="alert-circle-outline" title="Booking not found" />;
  }

  const status = booking.status ?? "pending";
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const canCancel = (status === "pending" || status === "confirmed") && booking.guestId === user?.id;
  const canReview = status === "completed" && booking.guestId === user?.id && !booking.hasReview;

  const totalEgp = booking.totalPriceEgp ?? booking.totalEgp ?? booking.priceEgp ?? "—";
  const totalUsd = booking.totalPriceUsd ?? booking.totalUsd ?? "—";

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.foreground }]}>Booking Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Ionicons name={statusCfg.icon as any} size={14} color={statusCfg.color} />
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.yachtName, { color: c.foreground }]}>{booking.yachtTitle ?? booking.yacht?.title ?? "Yacht"}</Text>
          <Text style={[styles.bookingId, { color: c.mutedForeground }]}>Booking #{id?.slice(0, 8).toUpperCase()}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <DetailRow label="Date" value={booking.bookingDate ?? "—"} icon="calendar-outline" />
          <DetailRow label="Time" value={booking.startTime ?? "—"} icon="time-outline" />
          <DetailRow label="Duration" value={booking.templateName ?? "—"} icon="hourglass-outline" />
          <DetailRow label="Guests" value={`${booking.guestCount ?? 1} person${booking.guestCount === 1 ? "" : "s"}`} icon="people-outline" />
          {booking.specialRequests ? (
            <DetailRow label="Special Requests" value={booking.specialRequests} icon="chatbubble-outline" />
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>Guest Information</Text>
          <DetailRow label="Name" value={booking.guestName ?? "—"} icon="person-outline" />
          <DetailRow label="Email" value={booking.guestEmail ?? "—"} icon="mail-outline" />
          <DetailRow label="Phone" value={booking.guestPhone ?? "—"} icon="call-outline" />
          {booking.guestNationality ? (
            <DetailRow label="Nationality" value={booking.guestNationality} icon="flag-outline" />
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>Payment Summary</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: c.foreground }]}>Total</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.totalEgp, { color: c.foreground }]}>EGP {totalEgp}</Text>
              {totalUsd !== "—" && (
                <Text style={[styles.totalUsd, { color: c.mutedForeground }]}>≈ ${totalUsd} USD</Text>
              )}
            </View>
          </View>
          <View style={[styles.paymentBadge, { backgroundColor: booking.paymentStatus === "paid" ? "#D1FAE5" : "#FEF3C7" }]}>
            <Ionicons
              name={booking.paymentStatus === "paid" ? "checkmark-circle-outline" : "card-outline"}
              size={16}
              color={booking.paymentStatus === "paid" ? "#065F46" : "#92400E"}
            />
            <Text style={[styles.paymentText, { color: booking.paymentStatus === "paid" ? "#065F46" : "#92400E" }]}>
              {booking.paymentStatus === "paid" ? "Payment received" : "Payment pending"}
            </Text>
          </View>
        </View>

        <Timeline status={status} />
      </ScrollView>

      {(canCancel || canReview) && (
        <View style={[styles.footer, { paddingBottom: bottomPad + 12, backgroundColor: c.background, borderTopColor: c.border }]}>
          {canReview && (
            <Pressable
              style={[styles.reviewBtn, { backgroundColor: colors.light.gold }]}
              onPress={goToReview}
            >
              <Ionicons name="star-outline" size={18} color="#fff" />
              <Text style={styles.reviewBtnText}>Write a Review</Text>
            </Pressable>
          )}
          {canCancel && (
            <Pressable
              style={[styles.cancelBtn, { borderColor: c.destructive, opacity: cancelLoading ? 0.6 : 1 }]}
              onPress={handleCancel}
              disabled={cancelLoading}
            >
              {cancelLoading ? (
                <ActivityIndicator color={c.destructive} size="small" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={c.destructive} />
                  <Text style={[styles.cancelBtnText, { color: c.destructive }]}>Cancel Booking</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  yachtName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  bookingId: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  totalEgp: { fontSize: 22, fontFamily: "Inter_700Bold" },
  totalUsd: { fontSize: 13, fontFamily: "Inter_400Regular" },
  paymentBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginTop: 8 },
  paymentText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16, paddingTop: 12, gap: 10, borderTopWidth: 1,
  },
  reviewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  reviewBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
