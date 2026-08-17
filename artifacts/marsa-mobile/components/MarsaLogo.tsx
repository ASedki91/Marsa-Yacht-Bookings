import { Image } from "expo-image";
import React from "react";
import type { ImageStyle, StyleProp } from "react-native";

interface MarsaLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function MarsaLogo({ size = 48, style }: MarsaLogoProps) {
  return (
    <Image
      accessibilityLabel="Marsa"
      contentFit="contain"
      source={require("@/assets/images/marsa-mark.png")}
      style={[{ width: size, height: size }, style]}
    />
  );
}
