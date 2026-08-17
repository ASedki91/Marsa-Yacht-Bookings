import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  legalDocuments,
  type LegalDocumentKey,
} from "@/constants/legal";

export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const router = useRouter();
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const requestedDocument = Array.isArray(params.document)
    ? params.document[0]
    : params.document;
  const documentKey: LegalDocumentKey =
    requestedDocument === "terms" ? "terms" : "privacy";
  const legalDocument = legalDocuments[documentKey];
  const topPadding = Platform.OS === "web" ? 24 : insets.top;

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 8,
            backgroundColor: palette.background,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: palette.card, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={palette.foreground} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: palette.foreground }]}>
          {legalDocument.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
      >
        <Text style={[styles.wordmark, { color: palette.foreground }]}>MARSA</Text>
        <Text style={[styles.title, { color: palette.foreground }]}>
          {legalDocument.title}
        </Text>
        <View style={styles.goldRule} />

        {!!legalDocument.introduction && (
          <Text style={[styles.body, styles.introduction, { color: palette.foreground }]}>
            {legalDocument.introduction}
          </Text>
        )}

        {legalDocument.sections.map((section) => (
          <View key={section.heading ?? section.body} style={styles.section}>
            {!!section.heading && (
              <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
                {section.heading}
              </Text>
            )}
            <Text style={[styles.body, { color: palette.foreground }]}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 64,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Marcellus_400Regular",
    fontSize: 18,
  },
  headerSpacer: { width: 38 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 22 },
  wordmark: {
    fontFamily: "Marcellus_400Regular",
    fontSize: 14,
    letterSpacing: 3.6,
    marginBottom: 7,
  },
  title: { fontFamily: "Marcellus_400Regular", fontSize: 30, lineHeight: 37 },
  goldRule: {
    width: 52,
    height: 2,
    backgroundColor: "#C2924F",
    marginTop: 12,
    marginBottom: 22,
  },
  introduction: { marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: "Marcellus_400Regular",
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 7,
  },
  body: {
    fontFamily: "HankenGrotesk_400Regular",
    fontSize: 15,
    lineHeight: 24,
  },
});
