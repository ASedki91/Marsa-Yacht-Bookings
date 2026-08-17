import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGetYacht } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { LoadingScreen } from "@/components/LoadingScreen";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";
import { useWishlist } from "@/hooks/useWishlist";

const { width } = Dimensions.get("window");

export default function YachtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [photoIndex, setPhotoIndex] = useState(0);
  const wishlist = useWishlist();

  const { data, isLoading, error } = useGetYacht(id!);
  const yacht = (data as any) ?? null;

  if (isLoading) return <LoadingScreen />;
  if (error || !yacht) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Yacht not found"
        subtitle="This yacht may no longer be available"
        actionLabel="Go Back"
        onAction={() => router.back()}
      />
    );
  }

  const photos = yacht.photos ?? [];
  const features = yacht.features ?? [];
  const reviews = yacht.reviews ?? [];
  const addOns = yacht.addOns ?? [];

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Pressable
        accessibilityLabel={
          wishlist.ids.has(yacht.id)
            ? "Remove from wishlist"
            : "Add to wishlist"
        }
        disabled={wishlist.isPending(yacht.id)}
        onPress={() => wishlist.toggle(yacht.id).catch(() => {})}
        style={[
          styles.wishlistButton,
          {
            top: Platform.OS === "web" ? 18 : insets.top + 10,
            opacity: wishlist.isPending(yacht.id) ? 0.6 : 1,
          },
        ]}
      >
        <Ionicons
          name={wishlist.ids.has(yacht.id) ? "heart" : "heart-outline"}
          size={22}
          color={wishlist.ids.has(yacht.id) ? "#E11D48" : colors.light.navy}
        />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false}>
        {photos.length > 0 ? (
          <View>
            <FlatList
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={photos}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item.url }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              )}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                setPhotoIndex(idx);
              }}
            />
            {photos.length > 1 && (
              <View style={styles.dots}>
                {photos.map((_: any, i: number) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i === photoIndex ? "#fff" : "rgba(255,255,255,0.5)",
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.photo,
              {
                backgroundColor: c.muted,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Ionicons name="boat-outline" size={64} color={c.mutedForeground} />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.headerBlock}>
            {yacht.category && (
              <Text style={[styles.category, { color: c.mutedForeground }]}>
                {yacht.category.name}
              </Text>
            )}
            <Text style={[styles.name, { color: c.foreground }]}>
              {yacht.name}
            </Text>

            <View style={styles.metaRow}>
              {yacht.capacity && (
                <View style={styles.metaItem}>
                  <Ionicons
                    name="people-outline"
                    size={16}
                    color={c.mutedForeground}
                  />
                  <Text style={[styles.metaText, { color: c.mutedForeground }]}>
                    Up to {yacht.capacity} guests
                  </Text>
                </View>
              )}
              {yacht.rating != null && (
                <View style={styles.metaItem}>
                  <Ionicons name="star" size={16} color={colors.light.gold} />
                  <Text style={[styles.metaText, { color: c.foreground }]}>
                    {yacht.rating.toFixed(1)}{" "}
                    <Text style={{ color: c.mutedForeground }}>
                      ({yacht.reviewCount || 0} reviews)
                    </Text>
                  </Text>
                </View>
              )}
            </View>
          </View>

          {yacht.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>
                About
              </Text>
              <Text style={[styles.description, { color: c.mutedForeground }]}>
                {yacht.description}
              </Text>
            </View>
          )}

          {features.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>
                Features
              </Text>
              <View style={styles.features}>
                {features.map((f: string) => (
                  <View
                    key={f}
                    style={[styles.featureChip, { backgroundColor: c.muted }]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={c.primary}
                    />
                    <Text style={[styles.featureText, { color: c.foreground }]}>
                      {f
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {yacht.basePriceEgp && (
            <View
              style={[
                styles.priceBox,
                { backgroundColor: c.card, borderColor: c.border },
              ]}
            >
              <View>
                <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>
                  Starting from
                </Text>
                <Text style={[styles.priceValue, { color: c.foreground }]}>
                  EGP {Number(yacht.basePriceEgp).toLocaleString("en-EG")}
                </Text>
              </View>
              <Text style={[styles.perBooking, { color: c.mutedForeground }]}>
                / booking
              </Text>
            </View>
          )}

          {reviews.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>
                Reviews
              </Text>
              {reviews.slice(0, 3).map((r: any) => (
                <View
                  key={r.id}
                  style={[
                    styles.reviewCard,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                >
                  <View style={styles.reviewHeader}>
                    <Text
                      style={[styles.reviewAuthor, { color: c.foreground }]}
                    >
                      {r.author?.name ?? "Guest"}
                    </Text>
                    <View style={styles.reviewRating}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons
                          key={s}
                          name="star"
                          size={12}
                          color={s <= r.rating ? colors.light.gold : c.muted}
                        />
                      ))}
                    </View>
                  </View>
                  <Text
                    style={[styles.reviewText, { color: c.mutedForeground }]}
                    numberOfLines={3}
                  >
                    {r.comment}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.background,
            borderTopColor: c.border,
            paddingBottom: bottomPad + 16,
          },
        ]}
      >
        <View>
          {yacht.basePriceEgp && (
            <Text style={[styles.footerPrice, { color: c.foreground }]}>
              EGP {Number(yacht.basePriceEgp).toLocaleString("en-EG")}
            </Text>
          )}
          <Text style={[styles.footerSub, { color: c.mutedForeground }]}>
            per booking
          </Text>
        </View>
        <Pressable
          style={[styles.bookBtn, { backgroundColor: colors.light.navy }]}
          onPress={() => router.push(`/(home)/book/${id}`)}
        >
          <Text style={styles.bookBtnText}>Book Now</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  wishlistButton: {
    position: "absolute",
    right: 18,
    zIndex: 5,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  photo: { width, height: 300 },
  dots: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  content: { padding: 20, gap: 20 },
  headerBlock: { gap: 6 },
  category: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  name: { fontSize: 24, fontFamily: "HankenGrotesk_700Bold" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontFamily: "Marcellus_400Regular" },
  description: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular", lineHeight: 22 },
  features: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
  },
  featureText: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular" },
  priceBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  priceLabel: { fontSize: 12, fontFamily: "HankenGrotesk_500Medium" },
  priceValue: { fontSize: 22, fontFamily: "HankenGrotesk_700Bold" },
  perBooking: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular" },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewAuthor: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  reviewRating: { flexDirection: "row", gap: 2 },
  reviewText: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", lineHeight: 19 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  footerPrice: { fontSize: 20, fontFamily: "HankenGrotesk_700Bold" },
  footerSub: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  bookBtnText: { color: "#fff", fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold" },
});
