import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useApplyAsHost, useRequestUploadUrl } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

const PERKS = [
  { icon: "cash-outline", title: "Earn in EGP", desc: "Get paid directly for every charter booking" },
  { icon: "shield-checkmark-outline", title: "Verified Platform", desc: "Your yacht gets a trust badge after approval" },
  { icon: "calendar-outline", title: "Full Flexibility", desc: "Control your own availability and pricing" },
  { icon: "headset-outline", title: "24/7 Support", desc: "MARSA team available for host assistance" },
];

const DOC_SLOTS = [
  { key: "govId", label: "Government-Issued ID", icon: "card-outline", required: true, hint: "Passport or national ID" },
  { key: "registration", label: "Boat Registration", icon: "document-text-outline", required: true, hint: "Official vessel registration certificate" },
  { key: "ownership", label: "Ownership Certificate", icon: "ribbon-outline", required: true, hint: "Proof of yacht ownership" },
  { key: "insurance", label: "Marine Insurance", icon: "shield-outline", required: false, hint: "Recommended — insurance policy document" },
];

type DocKey = "govId" | "registration" | "ownership" | "insurance";

const STEPS = ["About You", "Verification Documents"];

export default function BecomeHostScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const applyAsHost = useApplyAsHost();
  const requestUploadUrl = useRequestUploadUrl();

  const [step, setStep] = useState(0);
  const [bio, setBio] = useState("");
  const [docs, setDocs] = useState<Record<DocKey, string | null>>({
    govId: null, registration: null, ownership: null, insurance: null,
  });
  const [uploading, setUploading] = useState<DocKey | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const pickAndUploadDoc = async (key: DocKey) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow access to your photo library to upload documents.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(key);

      const ext = asset.uri.split(".").pop() ?? "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";

      const uploadRes = await requestUploadUrl.mutateAsync({
        data: { name: `host-doc-${key}-${Date.now()}.${ext}`, contentType, size: asset.fileSize ?? 0 },
      });
      const { uploadUrl, publicUrl } = uploadRes as any;

      const blob = await fetch(asset.uri).then((r) => r.blob());
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });

      setDocs((d) => ({ ...d, [key]: publicUrl }));
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message ?? "Could not upload document. Please try again.");
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async () => {
    if (bio.trim().length < 20) {
      Alert.alert("More detail needed", "Please write at least 20 characters about yourself.");
      return;
    }
    try {
      await applyAsHost.mutateAsync({ data: { bio: bio.trim() } });
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert("Application Error", err?.errors?.[0]?.message ?? err?.message ?? "Could not submit application.");
    }
  };

  if (submitted) {
    const uploadedCount = Object.values(docs).filter(Boolean).length;
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={c.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Application Submitted</Text>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}>
          <View style={[styles.successIcon, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="checkmark-circle-outline" size={52} color={colors.light.gold} />
          </View>
          <Text style={[styles.successTitle, { color: c.foreground }]}>Application Received!</Text>
          <Text style={[styles.successText, { color: c.mutedForeground }]}>
            Our team will review your application and documents within 2-3 business days.
          </Text>

          <View style={[styles.statusCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              <Text style={[styles.statusLabel, { color: c.foreground }]}>Application submitted</Text>
            </View>
            <View style={[styles.statusDivider, { backgroundColor: c.border }]} />
            <View style={styles.statusRow}>
              <Ionicons
                name={uploadedCount > 0 ? "checkmark-circle" : "time-outline"}
                size={20}
                color={uploadedCount > 0 ? "#22C55E" : colors.light.ocean}
              />
              <Text style={[styles.statusLabel, { color: c.foreground }]}>
                {uploadedCount} of {DOC_SLOTS.length} documents uploaded
              </Text>
            </View>
            <View style={[styles.statusDivider, { backgroundColor: c.border }]} />
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={20} color={c.mutedForeground} />
              <Text style={[styles.statusLabel, { color: c.mutedForeground }]}>Under review (2-3 business days)</Text>
            </View>
            <View style={[styles.statusDivider, { backgroundColor: c.border }]} />
            <View style={styles.statusRow}>
              <Ionicons name="rocket-outline" size={20} color={c.mutedForeground} />
              <Text style={[styles.statusLabel, { color: c.mutedForeground }]}>List your yacht & start earning</Text>
            </View>
          </View>

          {uploadedCount < DOC_SLOTS.filter((d) => d.required).length && (
            <View style={[styles.infoBox, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#EA580C" />
              <Text style={[styles.infoText, { color: "#9A3412" }]}>
                You still need to submit your verification documents. Email them to{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>verify@marsa.app</Text> to speed up your review.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.light.navy }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Back to Profile</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
        <Pressable
          onPress={() => { if (step === 0) router.back(); else setStep(0); }}
          style={styles.backBtn}
        >
          <Ionicons name={step === 0 ? "close" : "arrow-back"} size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Become a Host</Text>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </Text>
        </View>
        <View style={styles.dotRow}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.stepDot, { backgroundColor: i <= step ? colors.light.navy : c.muted }]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}>
        {step === 0 ? (
          <>
            <View style={[styles.heroCard, { backgroundColor: colors.light.navy }]}>
              <Ionicons name="boat" size={40} color={colors.light.gold} />
              <Text style={styles.heroTitle}>List Your Yacht on MARSA</Text>
              <Text style={styles.heroSub}>
                Join El Gouna's premier charter marketplace and start earning from your yacht
              </Text>
            </View>

            <View style={styles.perksGrid}>
              {PERKS.map((perk) => (
                <View key={perk.icon} style={[styles.perkCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[styles.perkIcon, { backgroundColor: colors.light.navy + "20" }]}>
                    <Ionicons name={perk.icon as any} size={22} color={colors.light.navy} />
                  </View>
                  <Text style={[styles.perkTitle, { color: c.foreground }]}>{perk.title}</Text>
                  <Text style={[styles.perkDesc, { color: c.mutedForeground }]}>{perk.desc}</Text>
                </View>
              ))}
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formTitle, { color: c.foreground }]}>About You & Your Yacht</Text>
              <Text style={[styles.formSub, { color: c.mutedForeground }]}>
                Tell us about your experience and the yacht you'd like to list. The more detail, the faster we can approve your application.
              </Text>
              <TextInput
                style={[styles.bioInput, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Describe your boating experience, your yacht's specifications (make, model, year, length), and why you want to join MARSA..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, { color: bio.length < 20 ? c.destructive : "#22C55E" }]}>
                {bio.length} characters {bio.length < 20 ? `(${20 - bio.length} more needed)` : "✓"}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.docHeader}>
              <View style={[styles.docIconBg, { backgroundColor: colors.light.navy + "15" }]}>
                <Ionicons name="shield-checkmark-outline" size={28} color={colors.light.navy} />
              </View>
              <Text style={[styles.docTitle, { color: c.foreground }]}>Verification Documents</Text>
              <Text style={[styles.docSub, { color: c.mutedForeground }]}>
                Upload photos of your documents to speed up approval. Required documents are marked with *.
              </Text>
            </View>

            {DOC_SLOTS.map((slot) => {
              const uri = docs[slot.key as DocKey];
              const isUploading = uploading === slot.key;
              return (
                <Pressable
                  key={slot.key}
                  style={[styles.docSlot, { backgroundColor: c.card, borderColor: uri ? "#22C55E" : c.border }]}
                  onPress={() => pickAndUploadDoc(slot.key as DocKey)}
                >
                  <View style={[styles.docSlotIcon, {
                    backgroundColor: uri ? "#22C55E20" : colors.light.navy + "15",
                  }]}>
                    {isUploading ? (
                      <ActivityIndicator size="small" color={colors.light.navy} />
                    ) : uri ? (
                      <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                    ) : (
                      <Ionicons name={slot.icon as any} size={22} color={colors.light.navy} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docSlotLabel, { color: c.foreground }]}>
                      {slot.label}
                      {slot.required ? <Text style={{ color: c.destructive }}> *</Text> : " (optional)"}
                    </Text>
                    <Text style={[styles.docSlotHint, { color: c.mutedForeground }]}>{slot.hint}</Text>
                    {uri && (
                      <Text style={[styles.docUploaded, { color: "#22C55E" }]}>✓ Uploaded</Text>
                    )}
                  </View>
                  {uri ? (
                    <Image source={{ uri }} style={styles.docThumb} />
                  ) : (
                    <View style={[styles.uploadBtn, { backgroundColor: colors.light.navy + "10" }]}>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.light.navy} />
                      <Text style={[styles.uploadBtnText, { color: colors.light.navy }]}>Upload</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <View style={[styles.infoBox, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.light.ocean} />
              <Text style={[styles.infoText, { color: "#1E40AF" }]}>
                Documents are securely stored and only reviewed by the MARSA team. They are never shared publicly.
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={c.mutedForeground} />
              <Text style={[styles.infoText, { color: c.mutedForeground }]}>
                You can submit without all documents and send them later to <Text style={{ fontFamily: "Inter_600SemiBold" }}>verify@marsa.app</Text>
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 12, backgroundColor: c.background, borderTopColor: c.border }]}>
        {step === 0 ? (
          <Pressable
            style={[styles.applyBtn, { backgroundColor: colors.light.navy, opacity: bio.trim().length < 20 ? 0.6 : 1 }]}
            onPress={() => {
              if (bio.trim().length < 20) {
                Alert.alert("More detail needed", "Please write at least 20 characters.");
                return;
              }
              setStep(1);
            }}
            disabled={bio.trim().length < 20}
          >
            <Text style={styles.applyBtnText}>Continue to Documents</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.applyBtn, { backgroundColor: colors.light.navy, opacity: applyAsHost.isPending ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={applyAsHost.isPending}
          >
            {applyAsHost.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="boat-outline" size={18} color="#fff" />
                <Text style={styles.applyBtnText}>Submit Application</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dotRow: { flexDirection: "row", gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  content: { padding: 16, gap: 20 },
  heroCard: { borderRadius: 20, padding: 24, gap: 10, alignItems: "center" },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#CBD5E1", textAlign: "center", lineHeight: 20 },
  perksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  perkCard: { flex: 1, minWidth: "44%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  perkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  perkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  perkDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  formSection: { gap: 10 },
  formTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  formSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bioInput: {
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top",
  },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  docHeader: { alignItems: "center", gap: 12, paddingVertical: 8 },
  docIconBg: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  docSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  docSlot: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  docSlotIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docSlotLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  docSlotHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  docUploaded: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  docThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#E2E8F0" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  uploadBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 12, borderTopWidth: 1 },
  applyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  applyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  statusCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  statusDivider: { height: 1 },
  statusLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  doneBtn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
