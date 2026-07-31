import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetYacht,
  useListBookingTemplates,
  useListAddOns,
  useGetYachtSlots,
  useCreateBooking,
  useGetCurrentCancellationPolicy,
} from "@workspace/api-client-react";
import { useStripe } from "@/lib/stripe";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { usePaymentConfig } from "@/contexts/PaymentConfigContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

const STEPS = ["Duration", "Date & Time", "Add-ons", "Details", "Payment"];

function formatWindow(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

function policyRuleLabels(rules: any[]) {
  const ordered = [...rules].sort(
    (left, right) =>
      right.minimumMinutesBeforeTrip - left.minimumMinutesBeforeTrip,
  );
  return ordered.map((rule, index) => {
    const threshold = rule.minimumMinutesBeforeTrip;
    const previous = ordered[index - 1]?.minimumMinutesBeforeTrip;
    const range =
      index === 0
        ? `${formatWindow(threshold)} or more before departure`
        : threshold === 0
          ? `Less than ${formatWindow(previous)} before departure`
          : `${formatWindow(threshold)} to less than ${formatWindow(previous)} before departure`;
    return { ...rule, range };
  });
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  const c = useColors();
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={stepStyles.stepRow}>
          <View
            style={[
              stepStyles.circle,
              {
                backgroundColor: i <= current ? colors.light.navy : c.muted,
                borderColor: i === current ? colors.light.ocean : "transparent",
                borderWidth: i === current ? 2 : 0,
              },
            ]}
          >
            {i < current ? (
              <Ionicons name="checkmark" size={12} color="#fff" />
            ) : (
              <Text style={[stepStyles.num, { color: i <= current ? "#fff" : c.mutedForeground }]}>
                {i + 1}
              </Text>
            )}
          </View>
          {i < total - 1 && (
            <View style={[stepStyles.line, { backgroundColor: i < current ? colors.light.navy : c.muted }]} />
          )}
        </View>
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  stepRow: { flexDirection: "row", alignItems: "center" },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  num: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  line: { height: 2, width: 24, marginHorizontal: 2 },
});

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const {
    config: paymentConfig,
    isLoading: paymentConfigLoading,
    error: paymentConfigError,
    refresh: refreshPaymentConfig,
  } = usePaymentConfig();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [payError, setPayError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [specialNote, setSpecialNote] = useState("");
  const [booking, setBooking] = useState<any>(null);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [cancellationTerms, setCancellationTerms] = useState<any>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  React.useEffect(() => {
    if (user?.name) setGuestName(user.name);
    if (user?.email) setGuestEmail(user.email);
  }, [user?.name, user?.email]);

  const { data: yachtData, isLoading: yachtLoading } = useGetYacht(id!);
  const { data: templatesData, isLoading: templatesLoading } = useListBookingTemplates();
  const { data: addOnsData } = useListAddOns();
  const createBooking = useCreateBooking();
  const cancellationPolicyQuery = useGetCurrentCancellationPolicy();

  const yacht = (yachtData as any) ?? null;
  const templates = (templatesData as any)?.templates ?? [];
  const allAddOns = (addOnsData as any)?.addOns ?? [];

  const fromDate = selectedDate || new Date().toISOString().split("T")[0];
  const toDate = fromDate;

  const dateOptions = React.useMemo(() => {
    const opts: { value: string; dow: string; day: string; mon: string }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      opts.push({
        value: `${year}-${month}-${day}`,
        dow: d.toLocaleDateString("en-US", { weekday: "short" }),
        day: String(d.getDate()),
        mon: d.toLocaleDateString("en-US", { month: "short" }),
      });
    }
    return opts;
  }, []);

  const { data: slotsData, isLoading: slotsLoading } = useGetYachtSlots(
    id!,
    { from: fromDate, to: toDate, templateId: selectedTemplate?.id },
    { query: { enabled: step === 1 && !!selectedTemplate } as any }
  );
  const slots = (slotsData as any)?.slots ?? [];

  const handleNext = async () => {
    await Haptics.selectionAsync();
    if (step === 4) {
      await handlePay();
      return;
    }
    setStep((s) => s + 1);
  };

  const handlePay = async () => {
    setPayError(null);
    try {
      const result = await createBooking.mutateAsync({
        data: {
          slotId: selectedSlot.id,
          yachtId: id!,
          templateId: selectedTemplate.id,
          bookingDate: selectedDate,
          startTime: selectedSlot.startTime,
          guestCount,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim(),
          guestEmail: guestEmail.trim(),
          specialRequests: specialNote.trim() || undefined,
          addOnIds: selectedAddOns.length > 0 ? selectedAddOns : undefined,
          acceptedCancellationPolicyId: (cancellationPolicyQuery.data as any)?.id,
        },
      });

      const {
        booking: createdBooking,
        payment,
        cancellationTerms: acceptedTerms,
      } = result as any;
      setBooking(createdBooking);
      setPaymentResult(payment);
      setCancellationTerms(acceptedTerms);

      if (
        payment?.gateway === "stripe" &&
        payment?.action?.type === "stripe_payment_sheet" &&
        payment?.action?.clientSecret
      ) {
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: "MARSA Charter",
          paymentIntentClientSecret: payment.action.clientSecret,
          defaultBillingDetails: {
            name: guestName.trim(),
            email: guestEmail.trim(),
          },
          returnURL: "marsa://payment-complete",
        });

        if (initError) {
          setPayError(initError.message ?? "Payment setup failed. Please try again.");
          return;
        }

        const { error: sheetError } = await presentPaymentSheet();

        if (sheetError) {
          if (sheetError.code === "Canceled") return;
          setPayError(sheetError.message ?? "Payment failed. Please try again.");
          return;
        }
      } else if (payment?.status !== "succeeded") {
        setPayError(
          "The payment gateway did not complete checkout. Please try again.",
        );
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(5);
    } catch (err: any) {
      setPayError(
        (err as any)?.errors?.[0]?.message ?? (err as any)?.message ?? "Could not create booking. Please try again.",
      );
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (yachtLoading || templatesLoading) return <LoadingScreen />;

  const totalAddOnPrice = selectedAddOns.reduce((sum, id) => {
    const ao = allAddOns.find((a: any) => a.id === id);
    return sum + (ao ? parseFloat(ao.priceEgp) : 0);
  }, 0);

  const basePrice = selectedTemplate
    ? (selectedSlot?.effectivePriceEgp ??
       yacht?.pricing?.find((p: any) => p.templateId === selectedTemplate.id)?.priceEgp ??
       yacht?.basePriceEgp ?? 0)
    : 0;

  const totalPrice = parseFloat(String(basePrice)) + totalAddOnPrice;
  const currentPolicy = cancellationPolicyQuery.data as any;
  const currentPolicyRules = policyRuleLabels(currentPolicy?.rules ?? []);

  const canNext = (() => {
    switch (step) {
      case 0: return !!selectedTemplate;
      case 1: return !!selectedSlot;
      case 2: return true;
      case 3: return guestCount > 0 && guestName.trim().length >= 2 && guestPhone.trim().length >= 6 && guestEmail.trim().includes("@");
      case 4:
        return (
          !paymentConfigLoading &&
          paymentConfig.checkoutEnabled &&
          !!cancellationPolicyQuery.data &&
          termsAccepted
        );
      default: return false;
    }
  })();

  if (step === 5) {
    return (
      <View style={[styles.success, { backgroundColor: c.background, paddingTop: topPad + 40 }]}>
        <View style={[styles.successIcon, { backgroundColor: "#D1FAE5" }]}>
          <Ionicons name="checkmark-circle" size={56} color="#065F46" />
        </View>
        <Text style={[styles.successTitle, { color: c.foreground }]}>Booking Requested!</Text>
        <Text style={[styles.successText, { color: c.mutedForeground }]}>
          Your booking request for {yacht?.name} has been submitted. The host will confirm shortly.
        </Text>
        {booking && (
          <View style={[styles.confirmBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.confirmLabel, { color: c.mutedForeground }]}>Total Amount</Text>
            <Text style={[styles.confirmAmount, { color: c.foreground }]}>
              EGP{" "}
              {Number(booking.totalAmountEgp ?? totalPrice).toLocaleString(
                "en-EG",
              )}
            </Text>
            <Text style={[styles.confirmSub, { color: c.mutedForeground }]}>
              {paymentResult?.gateway === "test"
                ? "Virtual test payment completed — no card was charged"
                : "Payment received — pending host confirmation"}
            </Text>
            {!!cancellationTerms && (
              <Text style={[styles.confirmSub, { color: c.mutedForeground }]}>
                Cancellation terms: {cancellationTerms.policyName} v
                {cancellationTerms.policyVersion}
              </Text>
            )}
          </View>
        )}
        <Pressable
          style={[styles.doneBtn, { backgroundColor: colors.light.navy }]}
          onPress={() => {
            router.replace("/(home)/guest/(tabs)/bookings" as any);
          }}
        >
          <Text style={styles.doneBtnText}>View My Bookings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: c.background, borderBottomColor: c.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => (step > 0 ? setStep((s) => s - 1) : router.back())}>
            <Ionicons name="arrow-back" size={24} color={c.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>
            {STEPS[step]}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={c.foreground} />
          </Pressable>
        </View>
        <StepIndicator current={step} total={STEPS.length} />
        <Text style={[styles.yachtName, { color: c.mutedForeground }]}>{yacht?.name}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepLabel, { color: c.foreground }]}>Select Duration</Text>
            {templates.map((t: any) => (
              <Pressable
                key={t.id}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: c.card,
                    borderColor: selectedTemplate?.id === t.id ? colors.light.navy : c.border,
                    borderWidth: selectedTemplate?.id === t.id ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedTemplate(t)}
              >
                <View>
                  <Text style={[styles.optionTitle, { color: c.foreground }]}>{t.name}</Text>
                  <Text style={[styles.optionSub, { color: c.mutedForeground }]}>
                    {t.durationHours} hours
                  </Text>
                </View>
                {selectedTemplate?.id === t.id && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.light.navy} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepLabel, { color: c.foreground }]}>Select Date</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateRow}
            >
              {dateOptions.map((d) => {
                const isSelected = selectedDate === d.value;
                return (
                  <Pressable
                    key={d.value}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: isSelected ? colors.light.navy : c.card,
                        borderColor: isSelected ? colors.light.navy : c.border,
                      },
                    ]}
                    onPress={() => {
                      setSelectedDate(d.value);
                      setSelectedSlot(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dateChipDow,
                        { color: isSelected ? "rgba(255,255,255,0.7)" : c.mutedForeground },
                      ]}
                    >
                      {d.dow}
                    </Text>
                    <Text
                      style={[
                        styles.dateChipDay,
                        { color: isSelected ? "#fff" : c.foreground },
                      ]}
                    >
                      {d.day}
                    </Text>
                    <Text
                      style={[
                        styles.dateChipMon,
                        { color: isSelected ? "rgba(255,255,255,0.7)" : c.mutedForeground },
                      ]}
                    >
                      {d.mon}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {slotsLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: 16 }} />
            ) : slots.length === 0 ? (
              <View style={[styles.noSlots, { backgroundColor: c.card, borderColor: c.border }]}>
                <Ionicons name="calendar-outline" size={32} color={c.mutedForeground} />
                <Text style={[styles.noSlotsText, { color: c.mutedForeground }]}>
                  {selectedDate ? "No available slots on this date" : "Enter a date to see availability"}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.slotsLabel, { color: c.foreground }]}>Available Slots</Text>
                {slots.map((slot: any) => {
                  const startTime = slot.startTime?.slice(0, 5) ?? "";
                  return (
                    <Pressable
                      key={slot.id}
                      style={[
                        styles.slotCard,
                        {
                          backgroundColor: c.card,
                          borderColor: selectedSlot?.id === slot.id ? colors.light.navy : c.border,
                          borderWidth: selectedSlot?.id === slot.id ? 2 : 1,
                        },
                      ]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <View>
                        <Text style={[styles.slotTime, { color: c.foreground }]}>
                          {startTime}
                        </Text>
                        {!!slot.effectivePriceEgp && (
                          <Text
                            style={[
                              styles.slotPrice,
                              { color: c.mutedForeground },
                            ]}
                          >
                            EGP{" "}
                            {Number(slot.effectivePriceEgp).toLocaleString(
                              "en-EG",
                            )}
                          </Text>
                        )}
                      </View>
                      {selectedSlot?.id === slot.id && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.light.navy} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepLabel, { color: c.foreground }]}>Add-ons (Optional)</Text>
            {allAddOns.length === 0 ? (
              <Text style={[styles.noSlotsText, { color: c.mutedForeground, textAlign: "center", marginTop: 20 }]}>
                No add-ons available for this yacht
              </Text>
            ) : (
              allAddOns.map((ao: any) => {
                const selected = selectedAddOns.includes(ao.id);
                return (
                  <Pressable
                    key={ao.id}
                    style={[
                      styles.optionCard,
                      {
                        backgroundColor: c.card,
                        borderColor: selected ? colors.light.ocean : c.border,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                    onPress={() =>
                      setSelectedAddOns((prev) =>
                        prev.includes(ao.id) ? prev.filter((x) => x !== ao.id) : [...prev, ao.id]
                      )
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: c.foreground }]}>{ao.name}</Text>
                      {ao.description && (
                        <Text style={[styles.optionSub, { color: c.mutedForeground }]} numberOfLines={2}>
                          {ao.description}
                        </Text>
                      )}
                    </View>
                    <View style={styles.addOnRight}>
                      <Text style={[styles.addOnPrice, { color: c.foreground }]}>
                        +EGP {Number(ao.priceEgp).toLocaleString("en-EG")}
                      </Text>
                      {selected && (
                        <Ionicons name="checkmark-circle" size={22} color={colors.light.ocean} />
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepLabel, { color: c.foreground }]}>Guest Details</Text>

            <View style={[styles.counterBox, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.counterLabel, { color: c.foreground }]}>Number of Guests</Text>
              <View style={styles.counter}>
                <Pressable
                  style={[styles.counterBtn, { backgroundColor: c.muted }]}
                  onPress={() => setGuestCount((g) => Math.max(1, g - 1))}
                >
                  <Ionicons name="remove" size={20} color={c.foreground} />
                </Pressable>
                <Text style={[styles.counterValue, { color: c.foreground }]}>{guestCount}</Text>
                <Pressable
                  style={[styles.counterBtn, { backgroundColor: c.muted }]}
                  onPress={() => setGuestCount((g) => Math.min(yacht?.capacity ?? 20, g + 1))}
                >
                  <Ionicons name="add" size={20} color={c.foreground} />
                </Pressable>
              </View>
              {yacht?.capacity && (
                <Text style={[styles.capacityNote, { color: c.mutedForeground }]}>
                  Max capacity: {yacht.capacity}
                </Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: c.foreground }]}>
                Full Name <Text style={{ color: c.destructive }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Your full name"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: c.foreground }]}>
                Phone Number <Text style={{ color: c.destructive }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
                value={guestPhone}
                onChangeText={setGuestPhone}
                placeholder="+20 100 000 0000"
                placeholderTextColor={c.mutedForeground}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: c.foreground }]}>
                Email <Text style={{ color: c.destructive }}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
                value={guestEmail}
                onChangeText={setGuestEmail}
                placeholder="you@example.com"
                placeholderTextColor={c.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: c.foreground }]}>
                Special Requests (Optional)
              </Text>
              <TextInput
                style={[styles.noteInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
                value={specialNote}
                onChangeText={setSpecialNote}
                placeholder="Dietary requirements, celebrations, preferences..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepLabel, { color: c.foreground }]}>Payment Summary</Text>

            <View style={[styles.summaryCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.summaryTitle, { color: c.foreground }]}>{yacht?.name}</Text>

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>Duration</Text>
                <Text style={[styles.summaryValue, { color: c.foreground }]}>
                  {selectedTemplate?.name} ({selectedTemplate?.durationHours}h)
                </Text>
              </View>

              {selectedSlot && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>Date & Time</Text>
                  <Text style={[styles.summaryValue, { color: c.foreground }]}>
                    {new Date(selectedDate).toLocaleDateString("en-EG", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {selectedSlot.startTime?.slice(0, 5) ?? ""}
                  </Text>
                </View>
              )}

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>Guests</Text>
                <Text style={[styles.summaryValue, { color: c.foreground }]}>{guestCount}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: c.border }]} />

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>Base price</Text>
                <Text style={[styles.summaryValue, { color: c.foreground }]}>
                  EGP {Number(basePrice).toLocaleString("en-EG")}
                </Text>
              </View>

              {selectedAddOns.length > 0 && (
                <>
                  {selectedAddOns.map((aoId) => {
                    const ao = allAddOns.find((a: any) => a.id === aoId);
                    return ao ? (
                      <View key={aoId} style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>
                          + {ao.name}
                        </Text>
                        <Text style={[styles.summaryValue, { color: c.foreground }]}>
                          EGP {Number(ao.priceEgp).toLocaleString("en-EG")}
                        </Text>
                      </View>
                    ) : null;
                  })}
                </>
              )}

              <View style={[styles.totalRow, { borderTopColor: c.border }]}>
                <Text style={[styles.totalLabel, { color: c.foreground }]}>Total</Text>
                <Text style={[styles.totalAmount, { color: colors.light.navy }]}>
                  EGP {totalPrice.toLocaleString("en-EG")}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.policyCard,
                { backgroundColor: c.card, borderColor: c.border },
              ]}
            >
              <View style={styles.policyHeader}>
                <View style={[styles.policyIcon, { backgroundColor: c.primary + "14" }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.policyTitle, { color: c.foreground }]}>
                    Cancellation terms
                  </Text>
                  <Text style={[styles.policySubtitle, { color: c.mutedForeground }]}>
                    {currentPolicy
                      ? `${currentPolicy.name} · version ${currentPolicy.version}`
                      : "No active policy is available"}
                  </Text>
                </View>
              </View>

              {cancellationPolicyQuery.isLoading ? (
                <ActivityIndicator color={c.primary} />
              ) : currentPolicyRules.length > 0 ? (
                <View style={styles.policyRules}>
                  {currentPolicyRules.map((rule) => (
                    <View key={rule.id} style={styles.policyRule}>
                      <View style={[styles.policyBullet, { backgroundColor: c.primary }]} />
                      <Text style={[styles.policyRange, { color: c.mutedForeground }]}>
                        {rule.range}
                      </Text>
                      <Text style={[styles.policyFee, { color: c.foreground }]}>
                        {Number(rule.feePercentage).toLocaleString("en-EG", {
                          maximumFractionDigits: 2,
                        })}
                        % fee
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.policyError, { color: c.destructive }]}>
                  Booking is temporarily unavailable until MARSA activates a
                  cancellation policy.
                </Text>
              )}

              <Pressable
                disabled={!currentPolicy}
                onPress={() => setTermsAccepted((accepted) => !accepted)}
                style={styles.acceptanceRow}
              >
                <Ionicons
                  name={termsAccepted ? "checkbox" : "square-outline"}
                  size={23}
                  color={termsAccepted ? c.primary : c.mutedForeground}
                />
                <Text style={[styles.acceptanceText, { color: c.foreground }]}>
                  I have reviewed and accept these cancellation terms.
                </Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.stripeNote,
                {
                  backgroundColor:
                    !paymentConfigLoading &&
                    paymentConfig.gateway === "disabled"
                      ? "#FEF2F2"
                      : "#EFF6FF",
                  borderColor:
                    !paymentConfigLoading &&
                    paymentConfig.gateway === "disabled"
                      ? "#FECACA"
                      : "#BFDBFE",
                },
              ]}
            >
              <Ionicons
                name={
                  paymentConfigLoading
                    ? "hourglass-outline"
                    : paymentConfig.gateway === "test"
                    ? "flask-outline"
                    : paymentConfig.gateway === "stripe"
                      ? "lock-closed-outline"
                      : "pause-circle-outline"
                }
                size={17}
                color={
                  !paymentConfigLoading &&
                  paymentConfig.gateway === "disabled"
                    ? "#DC2626"
                    : colors.light.ocean
                }
              />
              <View style={styles.paymentNoticeContent}>
                <Text
                  style={[
                    styles.stripeText,
                    {
                      color:
                        !paymentConfigLoading &&
                        paymentConfig.gateway === "disabled"
                          ? "#B91C1C"
                          : colors.light.ocean,
                    },
                  ]}
                >
                  {paymentConfigLoading
                    ? "Checking payment availability..."
                    : paymentConfig.gateway === "test"
                      ? "Virtual payment is ready. Completing it will record a successful test transaction and create the booking. No card or real money is used."
                      : paymentConfig.gateway === "stripe"
                        ? "Secure card checkout is enabled for this booking."
                        : "Checkout configuration is unavailable. Reload it to enable test payment in the development environment."}
                </Text>
                {!paymentConfigLoading &&
                  paymentConfig.gateway === "disabled" &&
                  paymentConfigError && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading payment configuration"
                      onPress={() => void refreshPaymentConfig()}
                      style={styles.paymentRetryButton}
                    >
                      <Ionicons name="refresh" size={14} color="#B91C1C" />
                      <Text style={styles.paymentRetryText}>Retry</Text>
                    </Pressable>
                  )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.border,
            paddingBottom: bottomPad + 8,
          },
        ]}
      >
        {payError && (
          <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{payError}</Text>
          </View>
        )}
        {step > 0 && (
          <Pressable
            style={[styles.backBtn, { borderColor: c.border }]}
            onPress={() => setStep((s) => s - 1)}
          >
            <Text style={[styles.backBtnText, { color: c.foreground }]}>Back</Text>
          </Pressable>
        )}
        <Pressable
          style={[
            styles.nextBtn,
            { backgroundColor: colors.light.navy, opacity: canNext ? 1 : 0.5, flex: step > 0 ? undefined : 1 },
          ]}
          onPress={handleNext}
          disabled={!canNext || createBooking.isPending}
        >
          {createBooking.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step === 4
                  ? paymentConfigLoading
                    ? "Checking Checkout..."
                    : paymentConfig.gateway === "test"
                      ? "Complete Virtual Payment"
                      : paymentConfig.gateway === "disabled"
                      ? "Checkout Unavailable"
                      : "Confirm & Pay"
                  : "Continue"}
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  yachtName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  content: { padding: 16 },
  stepContent: { gap: 14 },
  stepLabel: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  optionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  optionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  optionSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addOnRight: { alignItems: "flex-end", gap: 6 },
  addOnPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  dateRow: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  dateChip: {
    width: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },
  dateChipDow: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dateChipDay: { fontSize: 20, fontFamily: "Inter_700Bold" },
  dateChipMon: { fontSize: 11, fontFamily: "Inter_400Regular" },
  slotsLabel: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 8 },
  noSlots: { alignItems: "center", padding: 24, borderRadius: 14, borderWidth: 1, gap: 10 },
  noSlotsText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  slotCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
  },
  slotTime: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  slotPrice: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  counterBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  counterLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  counter: { flexDirection: "row", alignItems: "center", gap: 20 },
  counterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  counterValue: { fontSize: 24, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
  capacityNote: { fontSize: 12, fontFamily: "Inter_400Regular" },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 100,
  },
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTopWidth: 1 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  policyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
    gap: 14,
  },
  policyHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  policyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  policyTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  policySubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  policyRules: { gap: 9 },
  policyRule: { flexDirection: "row", alignItems: "center", gap: 7 },
  policyBullet: { width: 6, height: 6, borderRadius: 3 },
  policyRange: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  policyFee: { fontSize: 11, fontFamily: "Inter_700Bold" },
  policyError: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  acceptanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 2,
  },
  acceptanceText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  stripeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  stripeText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  paymentNoticeContent: { flex: 1, gap: 10 },
  paymentRetryButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  paymentRetryText: {
    color: "#B91C1C",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  backBtn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1, alignItems: "center" },
  backBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nextBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  nextBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  success: { flex: 1, alignItems: "center", paddingHorizontal: 32, gap: 20 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  confirmBox: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 6, width: "100%" },
  confirmLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  confirmAmount: { fontSize: 28, fontFamily: "Inter_700Bold" },
  confirmSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  doneBtn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    width: "100%",
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#DC2626", lineHeight: 18 },
});
