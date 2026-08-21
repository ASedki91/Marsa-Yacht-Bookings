import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

interface ConfirmActionModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const palette = useColors();
  const actionColor = destructive ? palette.destructive : palette.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close confirmation"
          disabled={loading}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.dialog,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <View
            style={[
              styles.icon,
              { backgroundColor: `${actionColor}14` },
            ]}
          >
            <Ionicons
              name={destructive ? "log-out-outline" : "help-circle-outline"}
              size={26}
              color={actionColor}
            />
          </View>

          <Text style={[styles.title, { color: palette.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: palette.mutedForeground }]}>
            {message}
          </Text>

          {!!error && (
            <View
              style={[
                styles.errorBox,
                { borderColor: `${palette.destructive}40` },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={17}
                color={palette.destructive}
              />
              <Text style={[styles.errorText, { color: palette.destructive }]}>
                {error}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                {
                  borderColor: palette.border,
                  opacity: pressed && !loading ? 0.72 : 1,
                },
              ]}
            >
              <Text style={[styles.cancelText, { color: palette.foreground }]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: actionColor,
                  opacity: loading ? 0.65 : pressed ? 0.82 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(5, 12, 24, 0.58)",
  },
  dialog: {
    width: "100%",
    maxWidth: 390,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  title: {
    fontFamily: "Marcellus_400Regular",
    fontSize: 20,
    textAlign: "center",
  },
  message: {
    fontFamily: "HankenGrotesk_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  errorBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: "HankenGrotesk_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  cancelText: {
    fontFamily: "HankenGrotesk_600SemiBold",
    fontSize: 14,
  },
  confirmText: {
    color: "#FFFFFF",
    fontFamily: "HankenGrotesk_600SemiBold",
    fontSize: 14,
  },
});
