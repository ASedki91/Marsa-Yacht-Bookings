import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
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
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { LoadingScreen } from "@/components/LoadingScreen";
import colors from "@/constants/colors";

const STEPS = ["Duration", "Date & Time", "Add-ons", "Details", "Payment"];

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

  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState(2);
  const [specialNote, setSpecialNote] = useState("");
  const [booking, setBooking] = useState<any>(null);

  const { data: yachtData, isLoading: yachtLoading } = useGetYacht(id!);
  const { data: templatesData, isLoading: templatesLoading } = useListBookingTemplates();
  const { data: addOnsData } = useListAddOns();
  const createBooking = useCreateBooking();

  const yacht = (yachtData as any) ?? null;
  const templates = (templatesData as any)?.templates ?? [];
  const allAddOns = (addOnsData as any)?.addOns ?? [];

  const fromDate = selectedDate || new Date().toISOString().split("T")[0];
  const toDate = fromDate;

  const { data: slotsData, isLoading: slotsLoading } = useGetYachtSlots(
    id!,
    { from: fromDate, to: toDate, templateId: selectedTemplate?.id },
    { query: { enabled: step === 1 && !!selectedTemplate } }
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
    try {
      const addOnsForRequest = selectedAddOns.map((id) => ({ addOnId: id }));
      const result = await createBooking.mutateAsync({
        yachtId: id!,
        templateId: selectedTemplate.id,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        guestCount,
        specialRequests: specialNote || undefined,
        addOns: addOnsForRequest,
      } as any);
      setBooking(result);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(5);
    } catch (err: any) {
      Alert.alert(
        "Booking Failed",
        err?.message ?? "Could not create booking. Please try again.",
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
    ? (yacht?.pricing?.find((p: any) => p.templateId === selectedTemplate.id)?.priceEgp ??
       yacht?.basePriceEgp ?? 0)
    : 0;

  const totalPrice = parseFloat(String(basePrice)) + totalAddOnPrice;

  const canNext = (() => {
    switch (step) {
      case 0: return !!selectedTemplate;
      case 1: return !!selectedSlot;
      case 2: return true;
      case 3: return guestCount > 0;
      case 4: return true;
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
              EGP {totalPrice.toLocaleString("en-EG")}
            </Text>
            <Text style={[styles.confirmSub, { color: c.mutedForeground }]}>
              Payment processed by Stripe — pending host confirmation
            </Text>
          </View>
        )}
        <Pressable
          style={[styles.doneBtn, { backgroundColor: colors.light.navy }]}
          onPress={() => {
            router.replace("/(home)/(tabs)/bookings");
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
            <TextInput
              style={[styles.dateInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
              value={selectedDate}
              onChangeText={setSelectedDate}
              placeholder="YYYY-MM-DD (e.g. 2025-08-15)"
              placeholderTextColor={c.mutedForeground}
            />

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
                  const startTime = new Date(slot.startTime).toLocaleTimeString("en-EG", { hour: "2-digit", minute: "2-digit" });
                  const endTime = new Date(slot.endTime).toLocaleTimeString("en-EG", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <Pressable
                      key={slot.startTime}
                      style={[
                        styles.slotCard,
                        {
                          backgroundColor: c.card,
                          borderColor: selectedSlot?.startTime === slot.startTime ? colors.light.navy : c.border,
                          borderWidth: selectedSlot?.startTime === slot.startTime ? 2 : 1,
                        },
                      ]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <Text style={[styles.slotTime, { color: c.foreground }]}>
                        {startTime} — {endTime}
                      </Text>
                      {selectedSlot?.startTime === slot.startTime && (
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
                Special Requests (Optional)
              </Text>
              <TextInput
                style={[styles.noteInput, { backgroundColor: c.input, borderColor: c.border, color: c.foreground }]}
                value={specialNote}
                onChangeText={setSpecialNote}
                placeholder="Dietary requirements, celebrations, preferences..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={4}
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
                    {new Date(selectedSlot.startTime).toLocaleDateString("en-EG", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {new Date(selectedSlot.startTime).toLocaleTimeString("en-EG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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

            <View style={[styles.stripeNote, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.light.ocean} />
              <Text style={[styles.stripeText, { color: colors.light.ocean }]}>
                Secured by Stripe. Your payment details are encrypted and safe.
              </Text>
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
                {step === 4 ? "Confirm & Pay" : "Continue"}
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
  dateInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
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
  counterBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  counterLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  counter: { flexDirection: "row", alignItems: "center", gap: 20 },
  counterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  counterValue: { fontSize: 24, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
  capacityNote: { fontSize: 12, fontFamily: "Inter_400Regular" },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  stripeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  stripeText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
});
