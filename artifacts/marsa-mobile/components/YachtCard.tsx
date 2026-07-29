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
    name?: string;
    title?: string;
    description?: string;
    location?: string;
    capacity?: number;
    basePriceEgp?: string;
    rating?: number;
    avgRating?: string;
    reviewCount?: number;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
    category?: { name: string };
    isFeatured?: boolean;
  };
  onPress: () => void;
  compact?: boolean;
  wishlisted?: boolean;
  wishlistPending?: boolean;
  onToggleWishlist?: () => void;
}

export function YachtCard({
  yacht,
  onPress,
  compact,
  wishlisted,
  wishlistPending,
  onToggleWishlist,
}: YachtCardProps) {
  const c = useColors();

  const primaryPhoto =
    yacht.photos?.find((p) => p.isPrimary) ?? yacht.photos?.[0];
  const price = yacht.basePriceEgp
    ? Number(yacht.basePriceEgp).toLocaleString("en-EG")
    : null;
  const title = yacht.title ?? yacht.name ?? "Yacht";
  const rating =
    yacht.rating ??
    (yacht.avgRating !== undefined ? Number(yacht.avgRating) : undefined);

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

      {yacht.isFeatured && !yacht.category && (
        <View style={[styles.badge, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="sparkles" size={11} color={colors.light.gold} />
          <Text style={styles.badgeText}>Featured</Text>
        </View>
      )}

      {onToggleWishlist && (
        <Pressable
          accessibilityLabel={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          disabled={wishlistPending}
          hitSlop={8}
          style={[
            styles.heartButton,
            {
              backgroundColor: "rgba(255,255,255,0.94)",
              opacity: wishlistPending ? 0.6 : 1,
            },
          ]}
          onPress={(event) => {
            event.stopPropagation();
            onToggleWishlist();
          }}
        >
          <Ionicons
            name={wishlisted ? "heart" : "heart-outline"}
            size={20}
            color={wishlisted ? "#E11D48" : colors.light.navy}
          />
        </Pressable>
      )}

      <View style={styles.content}>
        <Text style={[styles.name, { color: c.foreground }]} numberOfLines={1}>
          {title}
        </Text>

        {!!yacht.location && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={c.mutedForeground} />
            <Text
              style={[styles.metaText, { color: c.mutedForeground }]}
              numberOfLines={1}
            >
              {yacht.location}
            </Text>
          </View>
        )}

        <View style={styles.meta}>
          {yacht.capacity && (
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={13} color={c.mutedForeground} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                Up to {yacht.capacity}
              </Text>
            </View>
          )}
          {rating != null && Number.isFinite(rating) && (
            <View style={styles.metaRow}>
              <Ionicons name="star" size={13} color={colors.light.gold} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                {rating.toFixed(1)}{" "}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  heartButton: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
