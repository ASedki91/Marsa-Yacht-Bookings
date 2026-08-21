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
}

export function WhatsAppSupportButton({
  bookingId,
  context,
}: WhatsAppSupportButtonProps) {
  const colors = useColors();
  const supportConfig = useGetSupportConfig();
  const [error, setError] = useState<string | null>(null);
  const whatsappNumber = supportConfig.data?.whatsappSupportNumber;

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
        disabled={supportConfig.isLoading}
        onPress={(event) => {
          event.stopPropagation?.();
          void openSupport();
        }}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: "#22C55E",
            backgroundColor: "#22C55E12",
            opacity: supportConfig.isLoading ? 0.55 : pressed ? 0.82 : 1,
          },
        ]}
      >
        {supportConfig.isLoading ? (
          <ActivityIndicator size="small" color="#15803D" />
        ) : (
          <Ionicons name="logo-whatsapp" size={18} color="#15803D" />
        )}
        <Text
          style={[
            styles.label,
            { color: "#15803D" },
          ]}
        >
          WhatsApp Support
        </Text>
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
  label: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  error: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", textAlign: "center" },
});