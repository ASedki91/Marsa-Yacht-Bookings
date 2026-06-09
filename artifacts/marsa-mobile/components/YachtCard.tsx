import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

interface YachtCardProps {
  yacht: {
    id: string;
    name: string;
    description?: string;
    capacity?: number;
    basePriceEgp?: string;
    rating?: number;
    reviewCount?: number;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
    category?: { name: string };
  };
  onPress: () => void;
  compact?: boolean;
}

export function YachtCard({ yacht, onPress, compact }: YachtCardProps) {
  const c = useColors();

  const primaryPhoto =
    yacht.photos?.find((p) => p.isPrimary) ?? yacht.photos?.[0];
  const price = yacht.basePriceEgp
    ? Number(yacht.basePriceEgp).toLocaleString("en-EG")
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        compact && styles.compact,
      ]}
      onPress={onPress}
    >
      {primaryPhoto?.url ? (
        <Image
          source={{ uri: primaryPhoto.url }}
          style={compact ? styles.imageCompact : styles.image}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            compact ? styles.imageCompact : styles.image,
            { backgroundColor: c.muted, alignItems: "center", justifyContent: "center" },
          ]}
        >
          <Ionicons name="boat-outline" size={40} color={c.mutedForeground} />
        </View>
      )}

      {yacht.category && (
        <View style={[styles.badge, { backgroundColor: colors.light.navy }]}>
          <Text style={styles.badgeText}>{yacht.category.name}</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>
          {yacht.name}
        </Text>

        <View style={styles.meta}>
          {yacht.capacity && (
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={13} color={c.mutedForeground} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                Up to {yacht.capacity}
              </Text>
            </View>
          )}
          {yacht.rating != null && (
            <View style={styles.metaRow}>
              <Ionicons name="star" size={13} color={colors.light.gold} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                {yacht.rating.toFixed(1)}{" "}
                {yacht.reviewCount ? `(${yacht.reviewCount})` : ""}
              </Text>
            </View>
          )}
        </View>

        {price && (
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: c.foreground }]}>
              EGP {price}
            </Text>
            <Text style={[styles.perNight, { color: c.mutedForeground }]}>
              / booking
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 16,
  },
  compact: {
    width: 220,
    marginBottom: 0,
    marginRight: 12,
  },
  image: {
    width: "100%",
    height: 200,
  },
  imageCompact: {
    width: "100%",
    height: 140,
  },
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    padding: 14,
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  perNight: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
