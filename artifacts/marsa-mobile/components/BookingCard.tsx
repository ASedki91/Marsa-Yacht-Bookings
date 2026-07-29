import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  pending_payment: {
    label: "Pending Payment",
    color: "#92400E",
    bg: "#FEF3C7",
    icon: "card-outline",
  },
  paid_under_review: {
    label: "Under Review",
    color: "#1E40AF",
    bg: "#DBEAFE",
    icon: "search-outline",
  },
  confirmed: {
    label: "Confirmed",
    color: "#065F46",
    bg: "#D1FAE5",
    icon: "checkmark-circle-outline",
  },
  completed: {
    label: "Completed",
    color: "#1E40AF",
    bg: "#DBEAFE",
    icon: "checkmark-done-circle-outline",
  },
  cancel_requested: {
    label: "Cancel Requested",
    color: "#92400E",
    bg: "#FEF3C7",
    icon: "alert-outline",
  },
  cancelled: {
    label: "Cancelled",
    color: "#991B1B",
    bg: "#FEE2E2",
    icon: "close-circle-outline",
  },
  rejected_refunded: {
    label: "Rejected",
    color: "#6B7280",
    bg: "#F1F5F9",
    icon: "ban-outline",
  },
};

interface BookingCardProps {
  booking: {
    id: string;
    status: string;
    bookingDate?: string;
    startTime?: string;
    endTime?: string;
    totalAmountEgp?: string;
    yacht?: { name: string; photos?: Array<{ url: string }> };
    template?: { name: string; durationHours: number };
    guestCount?: number;
  };
  onPress: () => void;
  showActions?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  showLeaveReview?: boolean;
  onLeaveReview?: () => void;
}

export function BookingCard({
  booking,
  onPress,
  showActions,
  onConfirm,
  onReject,
  showLeaveReview,
  onLeaveReview,
}: BookingCardProps) {
  const c = useColors();
  const cfg = STATUS_CONFIG[booking.status] ?? {
    label: booking.status,
    color: c.mutedForeground,
    bg: c.muted,
    icon: "ellipse-outline" as keyof typeof Ionicons.glyphMap,
  };

  const startDate = booking.bookingDate
    ? new Date(`${booking.bookingDate}T12:00:00`).toLocaleDateString("en-EG", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const amount = booking.totalAmountEgp
    ? `EGP ${Number(booking.totalAmountEgp).toLocaleString("en-EG")}`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.top}>
        <View style={styles.nameBlock}>
          <Text
            style={[styles.yachtName, { color: c.foreground }]}
            numberOfLines={1}
          >
            {booking.yacht?.name ?? "Unknown Yacht"}
          </Text>
          {booking.template && (
            <Text style={[styles.template, { color: c.mutedForeground }]}>
              {booking.template.name} · {booking.template.durationHours}h
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={12} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {cfg.label}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        {startDate && (
          <View style={styles.detail}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={c.mutedForeground}
            />
            <Text style={[styles.detailText, { color: c.mutedForeground }]}>
              {startDate}
            </Text>
          </View>
        )}
        {booking.guestCount && (
          <View style={styles.detail}>
            <Ionicons
              name="people-outline"
              size={13}
              color={c.mutedForeground}
            />
            <Text style={[styles.detailText, { color: c.mutedForeground }]}>
              {booking.guestCount} guests
            </Text>
          </View>
        )}
        {amount && (
          <View style={styles.detail}>
            <Ionicons name="cash-outline" size={13} color={c.mutedForeground} />
            <Text
              style={[
                styles.detailText,
                { color: c.foreground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {amount}
            </Text>
          </View>
        )}
      </View>

      {showLeaveReview && (
        <Pressable
          style={[styles.reviewBtn, { backgroundColor: colors.light.gold }]}
          onPress={onLeaveReview}
        >
          <Ionicons name="star-outline" size={14} color="#fff" />
          <Text style={styles.reviewBtnText}>Leave Review</Text>
        </Pressable>
      )}

      {showActions && booking.status === "paid_under_review" && (
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { borderColor: c.destructive }]}
            onPress={onReject}
          >
            <Text style={[styles.actionBtnText, { color: c.destructive }]}>
              Reject
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: c.primary },
            ]}
            onPress={onConfirm}
          >
            <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>
              Confirm
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  nameBlock: {
    flex: 1,
    marginRight: 8,
  },
  yachtName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  template: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  details: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  actionBtnPrimary: {
    borderWidth: 0,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  reviewBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
