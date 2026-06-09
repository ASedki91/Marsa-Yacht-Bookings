import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Platform, ActivityIndicator, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSubmitReview } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const submitReview = useSubmitReview();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Rating required", "Please select a star rating before submitting.");
      return;
    }
    try {
      await submitReview.mutateAsync({
        id: id!,
        data: { rating, comment: comment.trim() || undefined, type: "guest" },
      });
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert("Error", err?.errors?.[0]?.message ?? "Could not submit review.");
    }
  };

  const ratingLabels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

  if (submitted) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: c.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={c.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Review Submitted</Text>
        </View>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="star" size={44} color={colors.light.gold} />
          </View>
          <Text style={[styles.successTitle, { color: c.foreground }]}>Thank you!</Text>
          <Text style={[styles.successText, { color: c.mutedForeground }]}>
            Your review has been submitted and helps other guests discover great charters.
          </Text>
          <Pressable
            style={[styles.doneBtn, { backgroundColor: colors.light.navy }]}
            onPress={() => router.replace("/(home)/(tabs)/bookings")}
          >
            <Text style={styles.doneBtnText}>Back to Bookings</Text>
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
        <Text style={[styles.headerTitle, { color: c.foreground }]}>Write a Review</Text>
      </View>

      <View style={[styles.content, { paddingBottom: bottomPad + 100 }]}>
        <View style={[styles.ratingSection, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.ratingTitle, { color: c.foreground }]}>How was your experience?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} style={styles.starBtn}>
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={40}
                  color={star <= rating ? colors.light.gold : c.mutedForeground}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && (
            <Text style={[styles.ratingLabel, { color: colors.light.gold }]}>
              {ratingLabels[rating]}
            </Text>
          )}
        </View>

        <View style={styles.commentSection}>
          <Text style={[styles.commentLabel, { color: c.foreground }]}>
            Share your experience <Text style={{ color: c.mutedForeground }}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.commentInput, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
            value={comment}
            onChangeText={setComment}
            placeholder="Tell other guests about the yacht, the host, and your overall experience..."
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={[styles.charCount, { color: c.mutedForeground }]}>{comment.length}/1000</Text>
        </View>

        <View style={[styles.tipCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={c.primary} />
          <Text style={[styles.tipText, { color: c.mutedForeground }]}>
            Reviews help the MARSA community discover quality yacht experiences. Be honest and specific.
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: bottomPad + 12, backgroundColor: c.background, borderTopColor: c.border }]}>
        <Pressable
          style={[styles.submitBtn, { backgroundColor: colors.light.navy, opacity: (rating === 0 || submitReview.isPending) ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={rating === 0 || submitReview.isPending}
        >
          {submitReview.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="star-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Review</Text>
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
  content: { flex: 1, padding: 16, gap: 20 },
  ratingSection: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 16 },
  ratingTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  stars: { flexDirection: "row", gap: 8 },
  starBtn: { padding: 4 },
  ratingLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  commentSection: { gap: 8 },
  commentLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  commentInput: {
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 140, textAlignVertical: "top",
  },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  tipCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 12, borderTopWidth: 1 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  doneBtn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
