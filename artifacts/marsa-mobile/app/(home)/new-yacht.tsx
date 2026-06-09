import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Platform, ActivityIndicator, Alert, Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useCreateYacht,
  useUpdateYacht,
  useListCategories,
  useSetYachtPricing,
  useListBookingTemplates,
  useSubmitYachtForReview,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

const STEPS = ["Basic Info", "Details", "Pricing", "Submit"];

const COMMON_FEATURES = [
  "Air Conditioning", "Swimming Platform", "Snorkeling Gear", "Fishing Equipment",
  "Bluetooth Sound System", "BBQ Grill", "Life Jackets", "First Aid Kit",
  "GPS Navigation", "WiFi", "Sun Deck", "Kitchenette",
];


export default function NewYachtScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!params.editId;

  const createYacht = useCreateYacht();
  const setYachtPricing = useSetYachtPricing();
  const submitForReview = useSubmitYachtForReview();

  const { data: categoriesData } = useListCategories();
  const { data: templatesData } = useListBookingTemplates();
  const categories = (categoriesData as any)?.categories ?? [];
  const templates = (templatesData as any)?.templates ?? [];

  const [step, setStep] = useState(0);
  const [yachtId, setYachtId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("El Gouna, Egypt");
  const [categoryId, setCategoryId] = useState("");
  const [capacity, setCapacity] = useState("8");

  const [lengthFt, setLengthFt] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [pricing, setPricing] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const toggleFeature = (f: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  const handleNextStep1 = async () => {
    if (!title.trim() || title.trim().length < 3) {
      Alert.alert("Required", "Please enter a yacht name (minimum 3 characters).");
      return;
    }
    if (!capacity || isNaN(Number(capacity)) || Number(capacity) < 1) {
      Alert.alert("Required", "Please enter a valid guest capacity.");
      return;
    }

    setLoading(true);
    try {
      const result = await createYacht.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || "El Gouna, Egypt",
          categoryId: categoryId || undefined,
          capacity: Number(capacity),
          lengthFt: lengthFt ? Number(lengthFt) : undefined,
          yearBuilt: yearBuilt ? Number(yearBuilt) : undefined,
          manufacturer: manufacturer.trim() || undefined,
          features: selectedFeatures,
        },
      });
      setYachtId((result as any).id);
      setStep(1);
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? err?.message ?? "Could not create yacht.");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = () => {
    setStep(2);
  };

  const handleStep3 = async () => {
    if (!yachtId) { setStep(3); return; }

    const pricingItems = templates
      .filter((t: any) => pricing[t.id]?.trim())
      .map((t: any) => ({ templateId: t.id, priceEgp: pricing[t.id].trim() }));

    if (pricingItems.length === 0) {
      Alert.alert("Pricing Required", "Please set a price for at least one booking template.");
      return;
    }

    setLoading(true);
    try {
      await setYachtPricing.mutateAsync({ id: yachtId, data: { pricing: pricingItems } });
      setStep(3);
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? "Could not save pricing.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!yachtId) return;
    setLoading(true);
    try {
      await submitForReview.mutateAsync({ id: yachtId });
      Alert.alert(
        "Submitted!",
        "Your yacht has been submitted for review. Our team will inspect it within 2-3 business days.",
        [{ text: "OK", onPress: () => router.replace("/(home)/(tabs)/yachts") }]
      );
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? "Could not submit for review.");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: c.foreground }]}>Basic Information</Text>
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>
              Tell guests about your yacht
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Yacht Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Sea Breeze, Blue Horizon"
                placeholderTextColor={c.mutedForeground}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your yacht's highlights, features, and what makes it special..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Location *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. El Gouna Marina"
                placeholderTextColor={c.mutedForeground}
              />
            </View>

            {categories.length > 0 && (
              <View style={styles.field}>
                <Text style={[styles.label, { color: c.foreground }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {categories.map((cat: any) => (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: categoryId === cat.id ? colors.light.navy : c.card,
                          borderColor: categoryId === cat.id ? colors.light.navy : c.border,
                        },
                      ]}
                      onPress={() => setCategoryId(categoryId === cat.id ? "" : cat.id)}
                    >
                      <Text style={[styles.chipText, { color: categoryId === cat.id ? "#fff" : c.foreground }]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Guest Capacity *</Text>
              <View style={styles.counterRow}>
                <Pressable
                  style={[styles.counterBtn, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => setCapacity((v) => String(Math.max(1, Number(v) - 1)))}
                >
                  <Ionicons name="remove" size={18} color={c.foreground} />
                </Pressable>
                <Text style={[styles.counterValue, { color: c.foreground }]}>{capacity}</Text>
                <Pressable
                  style={[styles.counterBtn, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => setCapacity((v) => String(Number(v) + 1))}
                >
                  <Ionicons name="add" size={18} color={c.foreground} />
                </Pressable>
              </View>
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: c.foreground }]}>Yacht Details</Text>
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>
              Technical specs and features
            </Text>

            <View style={styles.twoCol}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: c.foreground }]}>Length (ft)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                  value={lengthFt}
                  onChangeText={setLengthFt}
                  placeholder="e.g. 42"
                  placeholderTextColor={c.mutedForeground}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: c.foreground }]}>Year Built</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                  value={yearBuilt}
                  onChangeText={setYearBuilt}
                  placeholder="e.g. 2019"
                  placeholderTextColor={c.mutedForeground}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Manufacturer / Make</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={manufacturer}
                onChangeText={setManufacturer}
                placeholder="e.g. Sunseeker, Azimut, Beneteau"
                placeholderTextColor={c.mutedForeground}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Features & Amenities</Text>
              <View style={styles.featuresGrid}>
                {COMMON_FEATURES.map((f) => (
                  <Pressable
                    key={f}
                    style={[
                      styles.featureChip,
                      {
                        backgroundColor: selectedFeatures.includes(f) ? colors.light.navy + "15" : c.card,
                        borderColor: selectedFeatures.includes(f) ? colors.light.navy : c.border,
                      },
                    ]}
                    onPress={() => toggleFeature(f)}
                  >
                    {selectedFeatures.includes(f) && (
                      <Ionicons name="checkmark-circle" size={14} color={colors.light.navy} />
                    )}
                    <Text
                      style={[
                        styles.featureText,
                        { color: selectedFeatures.includes(f) ? colors.light.navy : c.foreground },
                      ]}
                    >
                      {f}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: c.foreground }]}>Set Pricing</Text>
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>
              Set your price in EGP for each booking duration
            </Text>

            {templates.length === 0 ? (
              <View style={[styles.noTemplates, { backgroundColor: c.card, borderColor: c.border }]}>
                <Ionicons name="alert-circle-outline" size={24} color={c.mutedForeground} />
                <Text style={[styles.noTemplatesText, { color: c.mutedForeground }]}>
                  No booking templates found. Contact support to set up templates for your region.
                </Text>
              </View>
            ) : (
              templates.map((t: any) => (
                <View key={t.id} style={[styles.pricingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.templateName, { color: c.foreground }]}>{t.name}</Text>
                    <Text style={[styles.templateDuration, { color: c.mutedForeground }]}>
                      {t.durationHours}h
                    </Text>
                  </View>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currency, { color: c.mutedForeground }]}>EGP</Text>
                    <TextInput
                      style={[styles.priceInput, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                      value={pricing[t.id] ?? ""}
                      onChangeText={(v) => setPricing((p) => ({ ...p, [t.id]: v }))}
                      placeholder="0"
                      placeholderTextColor={c.mutedForeground}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              ))
            )}

            <View style={[styles.feeNote, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={c.primary} />
              <Text style={[styles.feeNoteText, { color: c.mutedForeground }]}>
                MARSA takes a 15% platform fee. You receive 85% of each booking.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.successCard, { backgroundColor: colors.light.navy }]}>
              <Ionicons name="boat" size={48} color={colors.light.gold} />
              <Text style={styles.successTitle}>Almost Ready!</Text>
              <Text style={styles.successSub}>
                Your yacht listing is ready to submit for review. Our team will review it within 2-3 business days.
              </Text>
            </View>

            <View style={[styles.checkCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {[
                { label: "Yacht details", done: true },
                { label: "Technical specs", done: !!lengthFt || !!manufacturer },
                { label: "Features listed", done: selectedFeatures.length > 0 },
                { label: "Pricing set", done: Object.values(pricing).some((v) => !!v) },
              ].map((item, i) => (
                <View key={i} style={[styles.checkRow, { borderBottomColor: c.border }]}>
                  <Ionicons
                    name={item.done ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={item.done ? "#22C55E" : c.mutedForeground}
                  />
                  <Text style={[styles.checkText, { color: item.done ? c.foreground : c.mutedForeground }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.reviewNote, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.light.ocean} />
              <Text style={[styles.reviewNoteText, { color: "#1E40AF" }]}>
                After approval, your yacht will be visible to thousands of guests in El Gouna. You'll receive a notification when it's live.
              </Text>
            </View>
          </View>
        );
    }
  };

  const handleNext = async () => {
    if (step === 0) await handleNextStep1();
    else if (step === 1) handleStep2();
    else if (step === 2) await handleStep3();
    else await handleSubmitForReview();
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
        <Pressable
          onPress={() => { if (step === 0) router.back(); else setStep((s) => s - 1); }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>
            {isEdit ? "Edit Yacht" : "List Your Yacht"}
          </Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </Text>
        </View>
        <View style={styles.dotRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.stepDot, { backgroundColor: i <= step ? colors.light.navy : c.muted }]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}>
        {renderStep()}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 12, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Pressable
          style={[styles.nextBtn, { backgroundColor: colors.light.navy, opacity: loading ? 0.7 : 1 }]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step === STEPS.length - 1 ? "Submit for Review" : "Continue"}
              </Text>
              {step < STEPS.length - 1 && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dotRow: { flexDirection: "row", gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  scrollContent: { padding: 16 },
  stepContent: { gap: 18 },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  stepSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -8 },
  field: { gap: 8 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  chipRow: { flexDirection: "row" as any },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  counterRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  counterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  counterValue: { fontSize: 22, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
  twoCol: { flexDirection: "row", gap: 12 },
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  featureText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pricingRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  templateName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templateDuration: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  priceInputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currency: { fontSize: 13, fontFamily: "Inter_500Medium" },
  priceInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontFamily: "Inter_700Bold", minWidth: 80, textAlign: "right" },
  feeNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  feeNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  noTemplates: { padding: 20, borderRadius: 14, borderWidth: 1, gap: 10, alignItems: "center" },
  noTemplatesText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  successCard: { borderRadius: 20, padding: 24, alignItems: "center", gap: 12 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#CBD5E1", textAlign: "center", lineHeight: 20 },
  checkCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
  checkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  reviewNote: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  reviewNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 12, borderTopWidth: 1 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  nextBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
