import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert, Platform, Modal, TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetBooking,
  useGetBookingCancellationQuote,
  useCancelBooking,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";
import { WhatsAppSupportButton } from "@/components/WhatsAppSupportButton";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_payment:   { label: "Pending Payment",  color: "#92400E", bg: "#F2E5CF", icon: "card-outline" },
  paid_under_review: { label: "Under Review",     color: "#1E40AF", bg: "#DBEAFE", icon: "search-outline" },
  confirmed:         { label: "Confirmed",         color: "#065F46", bg: "#D1FAE5", icon: "checkmark-circle-outline" },
  completed:         { label: "Completed",         color: "#1E40AF", bg: "#DBEAFE", icon: "trophy-outline" },
  cancel_requested:  { label: "Cancel Requested", color: "#92400E", bg: "#F2E5CF", icon: "alert-outline" },
  cancelled:         { label: "Cancelled",         color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
  rejected_refunded: { label: "Rejected",          color: "#6B7280", bg: "#F1F5F9", icon: "ban-outline" },
};

const TIMELINE_STEPS = [
  { key: "pending_payment",   label: "Booking Requested",  sub: "Waiting for payment confirmation" },
  { key: "paid_under_review", label: "Payment Confirmed",  sub: "Waiting for host review" },
  { key: "confirmed",         label: "Booking Confirmed",  sub: "Host has accepted your booking" },
  { key: "completed",         label: "Trip Completed",     sub: "Your charter is complete" },
];

function remainingTimeLabel(minutes: number) {
  const absolute = Math.max(0, minutes);
  const days = Math.floor(absolute / 1440);
  const hours = Math.floor((absolute % 1440) / 60);
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours}h` : ""}`;
  }
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${absolute} minute${absolute === 1 ? "" : "s"}`;
}

function Timeline({ status }: { status: string }) {
  const c = useColors();
  const cancelled = status === "cancelled" || status === "rejected_refunded" || status === "cancel_requested";

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
          const ORDER = ["pending_payment", "paid_under_review", "confirmed", "completed"];
          const currentIdx = ORDER.indexOf(status);
          const isDone = currentIdx >= i + 1 || status === "completed";
          const isCurrent = currentIdx === i;

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
  heading: { fontSize: 16, fontFamily: "Marcellus_400Regular", marginBottom: 16 },
  stepRow: { flexDirection: "row", gap: 12 },
  leftCol: { alignItems: "center", width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, minHeight: 32, marginVertical: 4 },
  textCol: { paddingBottom: 24, flex: 1 },
  stepLabel: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  stepSub: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", marginTop: 2 },
  cancelledBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  cancelledText: { fontSize: 14, fontFamily: "HankenGrotesk_500Medium", flex: 1 },
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
  label: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular" },
  value: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold", maxWidth: "60%", textAlign: "right" },
});

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isHost } = useUser();
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelAccepted, setCancelAccepted] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [updatedQuote, setUpdatedQuote] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useGetBooking(id!);
  const quoteQuery = useGetBookingCancellationQuote(id!, {
    query: { enabled: cancelOpen && !!id } as any,
  });
  const cancelBooking = useCancelBooking();

  const booking = (data as any) ?? null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCancel = () => {
    setCancelReason("");
    setCancelAccepted(false);
    setUpdatedQuote(null);
    setCancelOpen(true);
  };

  const submitCancellation = async () => {
    const quote = updatedQuote ?? quoteQuery.data;
    if (!quote || !cancelAccepted) return;

    setCancelLoading(true);
    try {
      await cancelBooking.mutateAsync({
        id: id!,
        data: {
          reason: cancelReason.trim() || undefined,
          acceptedRuleId: quote.matchedRuleId ?? undefined,
          acceptedFeeAmountEgp: quote.feeAmountEgp ?? undefined,
        },
      });
      setCancelOpen(false);
      await refetch();
      Alert.alert(
        "Cancellation requested",
        "MARSA received your request. Your calculated refund will be reviewed and processed by the admin team.",
      );
    } catch (err: any) {
      const latestQuote = err?.data?.quote;
      if (err?.status === 409 && latestQuote) {
        setUpdatedQuote(latestQuote);
        setCancelAccepted(false);
        Alert.alert(
          "Cancellation quote updated",
          "The trip moved into a different cancellation window. Review the new fee and confirm again.",
        );
      } else {
        Alert.alert(
          "Could not request cancellation",
          err?.data?.error ??
            err?.errors?.[0]?.message ??
            err?.message ??
            "Please try again.",
        );
      }
    } finally {
      setCancelLoading(false);
    }
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

  const status = booking.status ?? "pending_payment";
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  const canCancel = ["pending_payment", "paid_under_review", "confirmed"].includes(status) && booking.guestId === user?.id;
  const canReview = status === "completed" && booking.guestId === user?.id && !booking.hasReview;
  const canGetSupport = [
    "pending_payment",
    "paid_under_review",
    "confirmed",
    "cancel_requested",
    "cancelled",
    "rejected_refunded",
  ].includes(status);

  const totalEgp = booking.totalAmountEgp ?? booking.totalPriceEgp ?? booking.totalEgp ?? "—";
  const totalUsd = booking.totalAmountUsd ?? booking.totalPriceUsd ?? booking.totalUsd ?? "—";
  const cancellationQuote = (updatedQuote ?? quoteQuery.data) as any;

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
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>Payment Receipt</Text>

          {/* Base charter price */}
          <DetailRow
            label="Charter price"
            value={booking.baseAmountEgp ? `EGP ${Number(booking.baseAmountEgp).toLocaleString("en-EG")}` : `EGP ${totalEgp}`}
            icon="boat-outline"
          />

          {/* Add-ons breakdown */}
          {Array.isArray(booking.addOns) && booking.addOns.length > 0 && (
            booking.addOns.map((addOn: any) => (
              <DetailRow
                key={addOn.id}
                label={addOn.name}
                value={`EGP ${Number(addOn.priceEgp).toLocaleString("en-EG")}`}
                icon="add-circle-outline"
              />
            ))
          )}

          {/* Divider + Total */}
          <View style={[styles.receiptDivider, { backgroundColor: c.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: c.foreground }]}>Total</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.totalEgp, { color: c.foreground }]}>EGP {typeof totalEgp === "number" ? Number(totalEgp).toLocaleString("en-EG") : totalEgp}</Text>
              {totalUsd !== "—" && (
                <Text style={[styles.totalUsd, { color: c.mutedForeground }]}>≈ ${totalUsd} USD</Text>
              )}
            </View>
          </View>

          {/* Payment status badge */}
          <View style={[styles.paymentBadge, { backgroundColor: booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid" ? "#D1FAE5" : "#F2E5CF" }]}>
            <Ionicons
              name={booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid" ? "checkmark-circle-outline" : "card-outline"}
              size={16}
              color={booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid" ? "#065F46" : "#92400E"}
            />
            <Text style={[styles.paymentText, { color: booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid" ? "#065F46" : "#92400E" }]}>
              {booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid" ? "Payment received" : "Payment pending"}
            </Text>
          </View>

          {/* Provider-neutral payment reference */}
          {(booking.providerPaymentId ?? booking.stripePaymentIntentId) ? (
            <View style={[styles.stripeRef, { backgroundColor: c.muted, borderColor: c.border }]}>
              <Ionicons name="shield-checkmark-outline" size={13} color={c.mutedForeground} />
              <Text style={[styles.stripeRefLabel, { color: c.mutedForeground }]}>
                {booking.isTestPayment
                  ? "Test ref:"
                  : `${booking.paymentProvider ?? "Payment"} ref:`}
              </Text>
              <Text style={[styles.stripeRefValue, { color: c.mutedForeground }]} numberOfLines={1}>
                {booking.providerPaymentId ?? booking.stripePaymentIntentId}
              </Text>
            </View>
          ) : null}
        </View>

        {!!booking.cancellationTerms && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.termsHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: c.foreground, marginBottom: 0 }]}>
                  Accepted cancellation terms
                </Text>
                <Text style={[styles.termsVersion, { color: c.mutedForeground }]}>
                  {booking.cancellationTerms.policyName} · version{" "}
                  {booking.cancellationTerms.policyVersion}
                </Text>
              </View>
            </View>
            {(booking.cancellationTerms.rules ?? [])
              .slice()
              .sort(
                (left: any, right: any) =>
                  right.minimumMinutesBeforeTrip -
                  left.minimumMinutesBeforeTrip,
              )
              .map((rule: any) => (
                <View key={rule.id} style={styles.termsRule}>
                  <Text style={[styles.termsWindow, { color: c.mutedForeground }]}>
                    {rule.minimumMinutesBeforeTrip === 0
                      ? "Final cancellation window"
                      : `${Math.round(rule.minimumMinutesBeforeTrip / 60)}+ hours before trip`}
                  </Text>
                  <Text style={[styles.termsFee, { color: c.foreground }]}>
                    {Number(rule.feePercentage).toLocaleString("en-EG", {
                      maximumFractionDigits: 2,
                    })}
                    % fee
                  </Text>
                </View>
              ))}
          </View>
        )}

        {canGetSupport && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>
              Need help with this booking?
            </Text>
            <Text style={[styles.supportCopy, { color: c.mutedForeground }]}>
              Our support team can help with your booking status, payment, or
              cancellation and refund questions.
            </Text>
            <WhatsAppSupportButton
              bookingId={id!}
              context={
                ["cancel_requested", "cancelled", "rejected_refunded"].includes(
                  status,
                )
                  ? "a cancellation or refund"
                  : undefined
              }
            />
          </View>
        )}

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

      <Modal
        visible={cancelOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !cancelLoading && setCancelOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !cancelLoading && setCancelOpen(false)}
        >
          <Pressable
            style={[styles.cancelSheet, { backgroundColor: c.background }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <View style={styles.cancelSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cancelSheetTitle, { color: c.foreground }]}>
                  Review cancellation
                </Text>
                <Text style={[styles.cancelSheetSubtitle, { color: c.mutedForeground }]}>
                  The fee and refund are calculated on the server right now.
                </Text>
              </View>
              <Pressable
                disabled={cancelLoading}
                onPress={() => setCancelOpen(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color={c.foreground} />
              </Pressable>
            </View>

            {quoteQuery.isLoading && !cancellationQuote ? (
              <View style={styles.quoteLoading}>
                <ActivityIndicator color={c.primary} />
                <Text style={[styles.quoteLoadingText, { color: c.mutedForeground }]}>
                  Calculating your current cancellation window…
                </Text>
              </View>
            ) : quoteQuery.error && !cancellationQuote ? (
              <View style={[styles.quoteError, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Ionicons name="alert-circle-outline" size={21} color="#B91C1C" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.quoteErrorTitle}>Quote unavailable</Text>
                  <Text style={styles.quoteErrorCopy}>
                    The booking may no longer be eligible for cancellation.
                  </Text>
                </View>
                <Pressable onPress={() => quoteQuery.refetch()}>
                  <Text style={styles.quoteRetry}>Retry</Text>
                </Pressable>
              </View>
            ) : cancellationQuote ? (
              <>
                <View
                  style={[
                    styles.quoteWindow,
                    { backgroundColor: c.primary + "12", borderColor: c.primary + "40" },
                  ]}
                >
                  <Ionicons name="time-outline" size={20} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quoteWindowLabel, { color: c.mutedForeground }]}>
                      Time before departure
                    </Text>
                    <Text style={[styles.quoteWindowValue, { color: c.foreground }]}>
                      {remainingTimeLabel(cancellationQuote.remainingMinutes)}
                    </Text>
                  </View>
                  {!cancellationQuote.manualReviewRequired &&
                    cancellationQuote.feePercentage !== null && (
                      <View style={[styles.feePill, { backgroundColor: "#F2E5CF" }]}>
                        <Text style={styles.feePillText}>
                          {Number(cancellationQuote.feePercentage).toLocaleString("en-EG", {
                            maximumFractionDigits: 2,
                          })}
                          % fee
                        </Text>
                      </View>
                    )}
                </View>

                {cancellationQuote.manualReviewRequired ? (
                  <View
                    style={[
                      styles.manualReview,
                      { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" },
                    ]}
                  >
                    <Ionicons name="person-outline" size={20} color="#C2410C" />
                    <Text style={styles.manualReviewText}>
                      This older booking does not have a policy snapshot. An admin
                      will review the applicable amount before issuing any refund.
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.quoteAmounts,
                      { backgroundColor: c.card, borderColor: c.border },
                    ]}
                  >
                    <View style={styles.quoteAmountRow}>
                      <Text style={[styles.quoteAmountLabel, { color: c.mutedForeground }]}>
                        Original payment
                      </Text>
                      <Text style={[styles.quoteAmountValue, { color: c.foreground }]}>
                        EGP{" "}
                        {Number(cancellationQuote.originalAmountEgp).toLocaleString(
                          "en-EG",
                        )}
                      </Text>
                    </View>
                    <View style={styles.quoteAmountRow}>
                      <Text style={[styles.quoteAmountLabel, { color: c.mutedForeground }]}>
                        Cancellation fee
                      </Text>
                      <Text style={[styles.quoteAmountValue, { color: c.destructive }]}>
                        − EGP{" "}
                        {Number(cancellationQuote.feeAmountEgp).toLocaleString("en-EG")}
                      </Text>
                    </View>
                    <View style={[styles.quoteRefundRow, { borderTopColor: c.border }]}>
                      <Text style={[styles.quoteRefundLabel, { color: c.foreground }]}>
                        Expected refund
                      </Text>
                      <Text style={styles.quoteRefundValue}>
                        EGP{" "}
                        {Number(cancellationQuote.refundAmountEgp).toLocaleString(
                          "en-EG",
                        )}
                      </Text>
                    </View>
                  </View>
                )}

                <View>
                  <Text style={[styles.cancelReasonLabel, { color: c.foreground }]}>
                    Reason (optional)
                  </Text>
                  <TextInput
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    maxLength={1000}
                    multiline
                    placeholder="Tell us why you need to cancel"
                    placeholderTextColor={c.mutedForeground}
                    style={[
                      styles.cancelReasonInput,
                      {
                        backgroundColor: c.input,
                        borderColor: c.border,
                        color: c.foreground,
                      },
                    ]}
                  />
                </View>

                <Pressable
                  onPress={() => setCancelAccepted((accepted) => !accepted)}
                  style={styles.cancelAcceptance}
                >
                  <Ionicons
                    name={cancelAccepted ? "checkbox" : "square-outline"}
                    size={23}
                    color={cancelAccepted ? c.primary : c.mutedForeground}
                  />
                  <Text style={[styles.cancelAcceptanceText, { color: c.foreground }]}>
                    {cancellationQuote.manualReviewRequired
                      ? "I understand that the refund amount requires admin review."
                      : "I understand the displayed cancellation fee and expected refund."}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!cancelAccepted || cancelLoading}
                  onPress={submitCancellation}
                  style={[
                    styles.submitCancel,
                    {
                      backgroundColor: c.destructive,
                      opacity: !cancelAccepted || cancelLoading ? 0.5 : 1,
                    },
                  ]}
                >
                  {cancelLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={19} color="#FFFFFF" />
                      <Text style={styles.submitCancelText}>
                        Request cancellation
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Marcellus_400Regular" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusLabel: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold" },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  yachtName: { fontSize: 18, fontFamily: "HankenGrotesk_700Bold" },
  bookingId: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", marginTop: 2 },
  sectionTitle: { fontSize: 15, fontFamily: "Marcellus_400Regular", marginBottom: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8 },
  totalLabel: { fontSize: 16, fontFamily: "HankenGrotesk_600SemiBold" },
  totalEgp: { fontSize: 22, fontFamily: "HankenGrotesk_700Bold" },
  totalUsd: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular" },
  paymentBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginTop: 8 },
  paymentText: { fontSize: 13, fontFamily: "HankenGrotesk_500Medium" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16, paddingTop: 12, gap: 10, borderTopWidth: 1,
  },
  reviewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  reviewBtnText: { color: "#fff", fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold" },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold" },
  receiptDivider: { height: 1, marginVertical: 8 },
  stripeRef: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, marginTop: 8,
  },
  stripeRefLabel: { fontSize: 11, fontFamily: "HankenGrotesk_500Medium" },
  stripeRefValue: { fontSize: 11, fontFamily: "HankenGrotesk_400Regular", flex: 1 },
  termsHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
  termsVersion: { fontSize: 11, fontFamily: "HankenGrotesk_400Regular", marginTop: 2 },
  termsRule: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
  },
  termsWindow: { flex: 1, fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  termsFee: { fontSize: 12, fontFamily: "HankenGrotesk_700Bold" },
  supportCopy: {
    fontSize: 13,
    fontFamily: "HankenGrotesk_400Regular",
    lineHeight: 19,
    marginBottom: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  cancelSheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 15,
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 4,
  },
  cancelSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cancelSheetTitle: { fontSize: 21, fontFamily: "HankenGrotesk_700Bold" },
  cancelSheetSubtitle: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_400Regular",
    lineHeight: 17,
    marginTop: 3,
  },
  quoteLoading: { alignItems: "center", gap: 10, paddingVertical: 30 },
  quoteLoadingText: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  quoteError: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quoteErrorTitle: { color: "#991B1B", fontSize: 13, fontFamily: "HankenGrotesk_700Bold" },
  quoteErrorCopy: {
    color: "#B91C1C",
    fontSize: 11,
    fontFamily: "HankenGrotesk_400Regular",
    marginTop: 2,
  },
  quoteRetry: { color: "#B91C1C", fontSize: 12, fontFamily: "HankenGrotesk_700Bold" },
  quoteWindow: {
    minHeight: 65,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quoteWindowLabel: { fontSize: 10, fontFamily: "HankenGrotesk_600SemiBold" },
  quoteWindowValue: { fontSize: 16, fontFamily: "HankenGrotesk_700Bold", marginTop: 2 },
  feePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  feePillText: { color: "#92400E", fontSize: 11, fontFamily: "HankenGrotesk_700Bold" },
  manualReview: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  manualReviewText: {
    flex: 1,
    color: "#9A3412",
    fontSize: 12,
    fontFamily: "HankenGrotesk_400Regular",
    lineHeight: 18,
  },
  quoteAmounts: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 10 },
  quoteAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quoteAmountLabel: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  quoteAmountValue: { fontSize: 13, fontFamily: "HankenGrotesk_600SemiBold" },
  quoteRefundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 11,
  },
  quoteRefundLabel: { fontSize: 14, fontFamily: "HankenGrotesk_700Bold" },
  quoteRefundValue: { color: "#047857", fontSize: 18, fontFamily: "HankenGrotesk_700Bold" },
  cancelReasonLabel: { fontSize: 13, fontFamily: "HankenGrotesk_600SemiBold", marginBottom: 7 },
  cancelReasonInput: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 13,
    fontFamily: "HankenGrotesk_400Regular",
  },
  cancelAcceptance: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  cancelAcceptanceText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "HankenGrotesk_500Medium",
    lineHeight: 18,
  },
  submitCancel: {
    minHeight: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  submitCancelText: { color: "#FFFFFF", fontSize: 14, fontFamily: "HankenGrotesk_700Bold" },
});
