import React from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useColors } from "@/hooks/useColors";

interface LoadingScreenProps {
  label?: string;
}

export function LoadingScreen({ label }: LoadingScreenProps) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label && (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
});
