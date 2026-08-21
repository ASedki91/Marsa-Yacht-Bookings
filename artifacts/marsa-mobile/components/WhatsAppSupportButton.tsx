import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGetSupportConfig } from "@workspace/api-client-react";

import { CONTACT_EMAIL } from "@/constants/legal";
import { useColors } from "@/hooks/useColors";

interface WhatsAppSupportButtonProps {
  bookingId?: string;
  context?: string;
  variant?: "default" | "profileRow";
}

export function WhatsAppSupportButton({
  bookingId,
  context,
  variant = "default",
}: WhatsAppSupportButtonProps) {
  const colors = useColors();
  const supportConfig = useGetSupportConfig();
  const [error, setError] = useState<string | null>(null);
  const whatsappNumber = supportConfig.data?.whatsappSupportNumber;
  const isProfileRow = variant === "profileRow";

  const openSupport = async () => {
    setError(null);
    if (!whatsappNumber) {
      try {
        await Linking.openURL(`mailto:${CONTACT_EMAIL}`);
      } catch {
        setError(`Please contact ${CONTACT_EMAIL}.`);
      }
      return;
    }

    const message = bookingId
      ? `Hello MARSA Support, I need help with booking #${bookingId.slice(0, 8).toUpperCase()}${context ? ` regarding ${context}` : ""}.`
      : `Hello MARSA Support, I need help with ${context ?? "my MARSA account"}.`;

    try {
      await Linking.openURL(
        `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
      );
    } catch {
      try {
        await Linking.openURL(`mailto:${CONTACT_EMAIL}`);
      } catch {
        setError(`Please contact ${CONTACT_EMAIL}.`);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        disabled={supportConfig.isLoading}
        onPress={(event) => {
          event.stopPropagation?.();
          void openSupport();
        }}
        style={({ pressed }) => [
          isProfileRow ? styles.profileButton : styles.button,
          {
            borderColor: isProfileRow ? colors.border : "#22C55E",
            backgroundColor: isProfileRow ? colors.card : "#22C55E12",
            opacity: supportConfig.isLoading ? 0.55 : pressed ? 0.82 : 1,
          },
        ]}
      >
        <View
          style={
            isProfileRow
              ? [styles.profileIcon, { backgroundColor: colors.primary + "14" }]
              : undefined
          }
        >
          {supportConfig.isLoading ? (
            <ActivityIndicator
              size="small"
              color={isProfileRow ? colors.primary : "#15803D"}
            />
          ) : (
            <Ionicons
              name="logo-whatsapp"
              size={isProfileRow ? 20 : 18}
              color={isProfileRow ? colors.primary : "#15803D"}
            />
          )}
        </View>
        <Text
          style={[
            isProfileRow ? styles.profileLabel : styles.label,
            { color: isProfileRow ? colors.foreground : "#15803D" },
          ]}
        >
          WhatsApp support
        </Text>
        {isProfileRow && (
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.mutedForeground}
          />
        )}
      </Pressable>
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  button: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  profileButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 11,
  },
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  profileLabel: {
    flex: 1,
    fontFamily: "HankenGrotesk_600SemiBold",
    fontSize: 14,
  },
  label: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  error: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", textAlign: "center" },
});