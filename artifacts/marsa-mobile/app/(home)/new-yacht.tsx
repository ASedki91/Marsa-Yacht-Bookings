import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Platform, ActivityIndicator, Alert, Switch, Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  useCreateYacht,
  useUpdateYacht,
  useGetYacht,
  useListCategories,
  useSetYachtPricing,
  useListBookingTemplates,
  useSubmitYachtForReview,
  useSetYachtAvailability,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

const STEPS = ["Basic Info", "Details", "Photos", "Pricing", "Availability", "Review"];

const COMMON_FEATURES = [
  "Air Conditioning", "Swimming Platform", "Snorkeling Gear", "Fishing Equipment",
  "Bluetooth Sound System", "BBQ Grill", "Life Jackets", "First Aid Kit",
  "GPS Navigation", "WiFi", "Sun Deck", "Kitchenette",
];

const DAYS_OF_WEEK = [
  { key: "0", label: "Sun" },
  { key: "1", label: "Mon" },
  { key: "2", label: "Tue" },
  { key: "3", label: "Wed" },
  { key: "4", label: "Thu" },
  { key: "5", label: "Fri" },
  { key: "6", label: "Sat" },
];

function buildSlotsForNextDays(
  daysEnabled: Record<string, boolean>,
  startTime: string,
  templates: any[],
  daysAhead = 60,
): { templateId: string; date: string; startTime: string; isAvailable: boolean }[] {
  const slots: { templateId: string; date: string; startTime: string; isAvailable: boolean }[] = [];
  const today = new Date();
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dayKey = String(d.getDay());
    if (!daysEnabled[dayKey]) continue;
    const dateStr = d.toISOString().slice(0, 10);
    for (const t of templates) {
      slots.push({ templateId: t.id, date: dateStr, startTime: startTime + ":00", isAvailable: true });
    }
  }
  return slots;
}

export default function NewYachtScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const editId = params.editId ?? "";
  const isEdit = !!editId;

  const createYacht = useCreateYacht();
  const updateYacht = useUpdateYacht();
  const setYachtPricing = useSetYachtPricing();
  const submitForReview = useSubmitYachtForReview();
  const setYachtAvailability = useSetYachtAvailability();
  const requestUploadUrl = useRequestUploadUrl();

  const { data: categoriesData } = useListCategories();
  const { data: templatesData } = useListBookingTemplates();
  const categories = (categoriesData as any)?.categories ?? [];
  const templates = (templatesData as any)?.templates ?? [];

  const { data: existingYachtData } = useGetYacht(editId, {
    query: { enabled: isEdit },
  });

  const [step, setStep] = useState(0);
  const [yachtId, setYachtId] = useState<string | null>(isEdit ? editId : null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("El Gouna, Egypt");
  const [categoryId, setCategoryId] = useState("");
  const [capacity, setCapacity] = useState("8");

  const [lengthFt, setLengthFt] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [requestPhotographer, setRequestPhotographer] = useState(false);

  const [pricing, setPricing] = useState<Record<string, string>>({});

  const [availDays, setAvailDays] = useState<Record<string, boolean>>({
    "0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false,
  });
  const [availStartTime, setAvailStartTime] = useState("09:00");

  const [loading, setLoading] = useState(false);

  // Pre-populate form when editing an existing yacht
  useEffect(() => {
    if (!isEdit || !existingYachtData) return;
    const y = existingYachtData as any;
    if (y.title) setTitle(y.title);
    if (y.description) setDescription(y.description);
    if (y.location) setLocation(y.location);
    if (y.categoryId) setCategoryId(y.categoryId);
    if (y.capacity) setCapacity(String(y.capacity));
    if (y.lengthFt) setLengthFt(String(y.lengthFt));
    if (y.yearBuilt) setYearBuilt(String(y.yearBuilt));
    if (y.manufacturer) setManufacturer(y.manufacturer);
    if (y.features?.length) setSelectedFeatures(y.features);
    const photos = y.photos?.map((p: any) => p.url ?? p.publicUrl ?? p) ?? [];
    if (photos.length) setPhotoUris(photos);
  }, [isEdit, existingYachtData]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const toggleFeature = (f: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow photo library access to upload yacht photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      const ext = asset.uri.split(".").pop() ?? "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";

      const uploadRes = await requestUploadUrl.mutateAsync({
        data: { name: `yacht-photo-${Date.now()}.${ext}`, contentType, size: asset.fileSize ?? 0 },
      });
      const { uploadUrl, publicUrl } = uploadRes as any;

      const blob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });

      setPhotoUris((prev) => [...prev, publicUrl]);
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message ?? "Could not upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
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
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || "El Gouna, Egypt",
        categoryId: categoryId || undefined,
        capacity: Number(capacity),
        lengthFt: lengthFt ? Number(lengthFt) : undefined,
        yearBuilt: yearBuilt ? Number(yearBuilt) : undefined,
        manufacturer: manufacturer.trim() || undefined,
        features: selectedFeatures,
      };
      if (isEdit && yachtId) {
        await updateYacht.mutateAsync({ id: yachtId, data: payload });
      } else {
        const result = await createYacht.mutateAsync({ data: payload });
        setYachtId((result as any).id);
      }
      setStep(1);
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? err?.message ?? "Could not save yacht.");
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    if (!yachtId) { setStep(3); return; }
    const pricingItems = templates
      .filter((t: any) => pricing[t.id]?.trim())
      .map((t: any) => ({
        templateId: t.id,
        priceEgp: pricing[t.id].trim().replace(/,/g, "").replace(/[^\d.]/g, ""),
      }))
      .filter((item) => /^\d+(\.\d{1,2})?$/.test(item.priceEgp) && Number(item.priceEgp) > 0);

    if (pricingItems.length === 0) {
      Alert.alert("Pricing Required", "Please set a valid price (numbers only) for at least one booking template.");
      return;
    }
    setLoading(true);
    try {
      await setYachtPricing.mutateAsync({ id: yachtId, data: { pricing: pricingItems } });
      setStep(4);
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? "Could not save pricing.");
    } finally {
      setLoading(false);
    }
  };

  const handleStep4Availability = async () => {
    if (!yachtId) { setStep(5); return; }
    const enabledDays = Object.entries(availDays).filter(([, v]) => v);
    if (enabledDays.length === 0) {
      Alert.alert("Select days", "Please select at least one day of the week you're available.");
      return;
    }
    if (templates.length === 0) { setStep(5); return; }

    setLoading(true);
    try {
      const slots = buildSlotsForNextDays(availDays, availStartTime, templates, 60);
      if (slots.length > 0) {
        await setYachtAvailability.mutateAsync({ id: yachtId, data: { slots } });
      }
      setStep(5);
    } catch (err: any) {
      Alert.alert("Availability Error", err?.errors?.[0]?.message ?? "Could not save availability.");
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
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>Tell guests about your yacht</Text>

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
                placeholder="e.g. Abu Tig Marina, El Gouna"
                placeholderTextColor={c.mutedForeground}
              />
              <Text style={[styles.hint, { color: c.mutedForeground }]}>Specify your marina or dock location</Text>
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
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>Technical specs and amenities</Text>

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
                    <Text style={[styles.featureText, { color: selectedFeatures.includes(f) ? colors.light.navy : c.foreground }]}>
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
            <Text style={[styles.stepTitle, { color: c.foreground }]}>Yacht Photos</Text>
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>
              Great photos get more bookings. Aim for 5–10 well-lit shots.
            </Text>

            <Pressable
              style={[styles.photographerCTA, { backgroundColor: colors.light.navy }]}
              onPress={() => {
                setRequestPhotographer(true);
                Alert.alert(
                  "Photographer Requested",
                  "Our team will contact you within 24 hours to schedule a professional photography session at no extra cost.",
                  [{ text: "Great, thanks!" }]
                );
              }}
            >
              <View style={styles.photographerLeft}>
                <View style={styles.photographerIconBg}>
                  <Ionicons name="camera" size={22} color={colors.light.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.photographerTitle}>Request a Photographer</Text>
                  <Text style={styles.photographerSub}>
                    Free professional photo shoot included for new hosts
                  </Text>
                </View>
              </View>
              {requestPhotographer ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.light.gold} />
              ) : (
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              )}
            </Pressable>

            {requestPhotographer && (
              <View style={[styles.infoBox, { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }]}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={[styles.infoText, { color: "#15803D" }]}>
                  Photographer requested! We'll contact you within 24 hours to schedule your session.
                </Text>
              </View>
            )}

            <View style={[styles.dividerRow]}>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.dividerText, { color: c.mutedForeground }]}>or upload your own</Text>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            </View>

            <View style={styles.photoGrid}>
              {photoUris.map((uri, i) => (
                <View key={uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <Pressable
                    style={styles.removePhotoBtn}
                    onPress={() => setPhotoUris((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </Pressable>
                  {i === 0 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Cover</Text>
                    </View>
                  )}
                </View>
              ))}

              {photoUris.length < 10 && (
                <Pressable
                  style={[styles.addPhotoBtn, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={pickPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator color={colors.light.navy} />
                  ) : (
                    <>
                      <Ionicons name="add" size={28} color={c.mutedForeground} />
                      <Text style={[styles.addPhotoText, { color: c.mutedForeground }]}>Add Photo</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <View style={[styles.photoTips, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.photoTipsTitle, { color: c.foreground }]}>Photo Tips</Text>
              {[
                "Shoot in bright natural daylight",
                "Include exterior, deck, cabin, and helm",
                "Show the swimming platform and water access",
                "Capture the view guests will enjoy",
              ].map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.light.ocean} />
                  <Text style={[styles.tipText, { color: c.mutedForeground }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      case 3:
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
              templates.map((t: any) => {
                const earned = pricing[t.id] ? Math.round(Number(pricing[t.id]) * 0.80) : 0;
                return (
                  <View key={t.id} style={[styles.pricingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateName, { color: c.foreground }]}>{t.name}</Text>
                      <Text style={[styles.templateDuration, { color: c.mutedForeground }]}>{t.durationHours}h charter</Text>
                      {pricing[t.id] ? (
                        <Text style={[styles.earningsPreview, { color: "#22C55E" }]}>
                          You earn: EGP {earned.toLocaleString("en-EG")}
                        </Text>
                      ) : null}
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
                );
              })
            )}

            <View style={[styles.feeNote, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={c.primary} />
              <Text style={[styles.feeNoteText, { color: c.mutedForeground }]}>
                MARSA takes a 20% platform fee. You receive 80% of each booking. Prices shown above reflect your earnings.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: c.foreground }]}>Set Availability</Text>
            <Text style={[styles.stepSub, { color: c.mutedForeground }]}>
              Choose which days your yacht is available for charter. We'll create slots for the next 60 days.
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Available Days</Text>
              <View style={styles.daysRow}>
                {DAYS_OF_WEEK.map((day) => (
                  <Pressable
                    key={day.key}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: availDays[day.key] ? colors.light.navy : c.card,
                        borderColor: availDays[day.key] ? colors.light.navy : c.border,
                      },
                    ]}
                    onPress={() => setAvailDays((d) => ({ ...d, [day.key]: !d[day.key] }))}
                  >
                    <Text style={[styles.dayChipText, { color: availDays[day.key] ? "#fff" : c.foreground }]}>
                      {day.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Charter Start Time</Text>
              <View style={styles.timeRow}>
                {["07:00", "08:00", "09:00", "10:00", "11:00", "14:00"].map((t) => (
                  <Pressable
                    key={t}
                    style={[
                      styles.timeChip,
                      {
                        backgroundColor: availStartTime === t ? colors.light.navy : c.card,
                        borderColor: availStartTime === t ? colors.light.navy : c.border,
                      },
                    ]}
                    onPress={() => setAvailStartTime(t)}
                  >
                    <Text style={[styles.timeChipText, { color: availStartTime === t ? "#fff" : c.foreground }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.hint, { color: c.mutedForeground }]}>
                Duration is set by the booking template the guest chooses. Multiple start times can be added after listing goes live.
              </Text>
            </View>

            <View style={[styles.availSummary, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="calendar-outline" size={20} color={colors.light.ocean} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.availSummaryTitle, { color: c.foreground }]}>Availability Preview</Text>
                <Text style={[styles.availSummaryText, { color: c.mutedForeground }]}>
                  {Object.values(availDays).filter(Boolean).length} days/week ·{" "}
                  Starting at {availStartTime} ·{" "}
                  ~{Object.values(availDays).filter(Boolean).length * templates.length * 8} slots over 60 days
                </Text>
              </View>
            </View>

            <View style={[styles.infoBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.light.ocean} />
              <Text style={[styles.infoText, { color: "#1E40AF" }]}>
                You can adjust your availability at any time from the Host Dashboard after your listing is live.
              </Text>
            </View>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.successCard, { backgroundColor: colors.light.navy }]}>
              <Ionicons name="boat" size={48} color={colors.light.gold} />
              <Text style={styles.successTitle}>Almost Ready!</Text>
              <Text style={styles.successSub}>
                Your yacht listing is ready for review. Our team will inspect it within 2-3 business days.
              </Text>
            </View>

            <View style={[styles.checkCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {[
                { label: "Yacht details", done: !!title },
                { label: "Technical specs", done: !!lengthFt || !!manufacturer },
                { label: "Features listed", done: selectedFeatures.length > 0 },
                { label: "Photos added", done: photoUris.length > 0 || requestPhotographer },
                { label: "Pricing set", done: Object.values(pricing).some((v) => !!v) },
                { label: "Availability configured", done: Object.values(availDays).some(Boolean) },
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
                After approval, your yacht will be visible to guests in El Gouna. You'll receive a notification when it's live.
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const handleNext = async () => {
    if (step === 0) await handleNextStep1();
    else if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) await handleStep3();
    else if (step === 4) await handleStep4Availability();
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
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
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
  photographerCTA: {
    flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 16, gap: 12,
  },
  photographerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  photographerIconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  photographerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  photographerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#CBD5E1", marginTop: 2 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumbWrap: { position: "relative" },
  photoThumb: { width: 100, height: 75, borderRadius: 10 },
  removePhotoBtn: {
    position: "absolute", top: -6, right: -6,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10,
  },
  coverBadge: {
    position: "absolute", bottom: 4, left: 4,
    backgroundColor: colors.light.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  coverBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  addPhotoBtn: {
    width: 100, height: 75, borderRadius: 10, borderWidth: 1, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  addPhotoText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  photoTips: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  photoTipsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  pricingRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  templateName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templateDuration: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  earningsPreview: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  priceInputRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  currency: { fontSize: 13, fontFamily: "Inter_500Medium" },
  priceInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontFamily: "Inter_700Bold", minWidth: 80, textAlign: "right" },
  feeNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  feeNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  noTemplates: { padding: 20, borderRadius: 14, borderWidth: 1, gap: 10, alignItems: "center" },
  noTemplatesText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  daysRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, minWidth: 50, alignItems: "center" },
  dayChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  timeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  availSummary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  availSummaryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  availSummaryText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
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
