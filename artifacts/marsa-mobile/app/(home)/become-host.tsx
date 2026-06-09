import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApplyAsHost } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

const PERKS = [
  { icon: "cash-outline", title: "Earn in EGP", desc: "Get paid directly for every charter booking" },
  { icon: "shield-checkmark-outline", title: "Verified Platform", desc: "Your yacht gets a trust badge after approval" },
  { icon: "calendar-outline", title: "Full Flexibility", desc: "Control your own availability and pricing" },
  { icon: "headset-outline", title: "24/7 Support", desc: "MARSA team available for host assistance" },
];

export default function BecomeHostScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const applyAsHost = useApplyAsHost();

  const [bio, setBio] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleApply = async () => {
    if (bio.trim().length < 20) {
      Alert.alert("More detail needed", "Please write at least 20 characters about yourself and your yacht.");
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
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={c.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Application Submitted</Text>
        </View>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="checkmark-circle-outline" size={52} color={colors.light.gold} />
          </View>
          <Text style={[styles.successTitle, { color: c.foreground }]}>Application Received!</Text>
          <Text style={[styles.successText, { color: c.mutedForeground }]}>
            Our team will review your application within 2-3 business days. We'll notify you once approved.
          </Text>
          <View style={[styles.pendingBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="time-outline" size={20} color={colors.light.ocean} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingTitle, { color: c.foreground }]}>Application Pending</Text>
              <Text style={[styles.pendingText, { color: c.mutedForeground }]}>Review time: 2-3 business days</Text>
            </View>
          </View>
          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.light.navy }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Back to Profile</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.foreground }]}>Become a Host</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}>
        <View style={[styles.heroCard, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="boat" size={40} color={colors.light.gold} />
          <Text style={styles.heroTitle}>List Your Yacht on MARSA</Text>
          <Text style={styles.heroSub}>
            Join El Gouna's premier charter marketplace and start earning from your yacht
          </Text>
        </View>

        <View style={[styles.perksGrid]}>
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
            Tell us about yourself and the yacht you'd like to list. The more detail, the faster we can approve your application.
          </Text>
          <TextInput
            style={[styles.bioInput, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your experience with boats, your yacht's specifications (make, model, year, length), and why you want to join MARSA..."
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: bio.length < 20 ? c.destructive : c.mutedForeground }]}>
            {bio.length} characters {bio.length < 20 ? `(${20 - bio.length} more needed)` : "✓"}
          </Text>
        </View>

        <View style={[styles.stepsCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.stepsTitle, { color: c.foreground }]}>What happens next?</Text>
          {[
            "Submit your application below",
            "Our team reviews it (2-3 days)",
            "Upload verification documents",
            "List your yacht and start earning",
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: colors.light.navy }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: c.foreground }]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 12, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Pressable
          style={[styles.applyBtn, { backgroundColor: colors.light.navy, opacity: (bio.trim().length < 20 || applyAsHost.isPending) ? 0.6 : 1 }]}
          onPress={handleApply}
          disabled={bio.trim().length < 20 || applyAsHost.isPending}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
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
  stepsCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  stepsTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  stepText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 12, borderTopWidth: 1 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  applyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  pendingBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, width: "100%" },
  pendingTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pendingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  doneBtn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
