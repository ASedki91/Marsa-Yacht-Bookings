import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

function SkeletonBox({ width, height, borderRadius = 8, style }: {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.muted, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonYachtCard() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SkeletonBox width="100%" height={180} borderRadius={12} />
      <View style={styles.content}>
        <SkeletonBox width="70%" height={18} />
        <SkeletonBox width="50%" height={14} style={{ marginTop: 4 }} />
        <View style={styles.row}>
          <SkeletonBox width={80} height={14} />
          <SkeletonBox width={60} height={24} borderRadius={100} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonBookingCard() {
  const colors = useColors();
  return (
    <View style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.bookingContent}>
        <SkeletonBox width={56} height={56} borderRadius={12} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="60%" height={16} />
          <SkeletonBox width="40%" height={12} />
          <SkeletonBox width="30%" height={12} />
        </View>
        <SkeletonBox width={60} height={24} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 16,
  },
  content: {
    padding: 14,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  bookingCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  bookingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
