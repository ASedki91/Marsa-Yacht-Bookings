import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListWishlist } from "@workspace/api-client-react";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonYachtCard } from "@/components/SkeletonCard";
import { YachtCard } from "@/components/YachtCard";
import { useColors } from "@/hooks/useColors";
import { useWishlist } from "@/hooks/useWishlist";

export default function WishlistScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wishlist = useWishlist();
  const yachtsQuery = useListWishlist();
  const [refreshing, setRefreshing] = useState(false);
  const yachts: any[] = (yachtsQuery.data as any)?.yachts ?? [];
  const topPad = Platform.OS === "web" ? 28 : insets.top;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([wishlist.refetch(), yachtsQuery.refetch()]);
    setRefreshing(false);
  }, [wishlist, yachtsQuery]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: palette.primary }]}>
          SAVED FOR LATER
        </Text>
        <Text style={[styles.title, { color: palette.foreground }]}>
          Your wishlist
        </Text>
        <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
          Keep your favourite yachts together while you plan.
        </Text>
      </View>

      {wishlist.isLoading || yachtsQuery.isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((item) => (
            <SkeletonYachtCard key={item} />
          ))}
        </View>
      ) : yachtsQuery.error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load your wishlist"
          actionLabel="Retry"
          onAction={refresh}
        />
      ) : yachts.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Your wishlist is empty"
          subtitle="Tap the heart on any yacht to save it here."
          actionLabel="Explore Yachts"
          onAction={() => router.replace("/(home)/guest/(tabs)/explore" as any)}
        />
      ) : (
        <FlatList
          data={yachts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 36 : insets.bottom + 88 },
          ]}
          renderItem={({ item }) => (
            <YachtCard
              yacht={item}
              wishlisted
              wishlistPending={wishlist.isPending(item.id)}
              onToggleWishlist={() => wishlist.toggle(item.id).catch(() => {})}
              onPress={() => router.push(`/(home)/yacht/${item.id}`)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  kicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 26 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  list: { padding: 16 },
});
