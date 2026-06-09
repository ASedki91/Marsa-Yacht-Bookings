import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListYachts, useListCategories } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { YachtCard } from "@/components/YachtCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonYachtCard } from "@/components/SkeletonCard";
import colors from "@/constants/colors";

export default function ExploreScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: categoriesData } = useListCategories();
  const categories = (categoriesData as any)?.categories ?? [];

  const { data, isLoading, error, refetch } = useListYachts({
    limit: 20,
    categoryId: selectedCategory,
  });

  const yachts = (data as any)?.yachts ?? [];

  const filtered = search.trim()
    ? yachts.filter((y: any) =>
        y.name.toLowerCase().includes(search.toLowerCase()) ||
        y.description?.toLowerCase().includes(search.toLowerCase())
      )
    : yachts;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: c.background, borderBottomColor: c.border },
        ]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { color: c.mutedForeground }]}>El Gouna, Egypt</Text>
            <Text style={[styles.title, { color: c.foreground }]}>Find Your Yacht</Text>
          </View>
          <View style={[styles.waveIcon, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="boat" size={22} color={colors.light.gold} />
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: c.input, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={18} color={c.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: c.foreground }]}
            placeholder="Search yachts..."
            placeholderTextColor={c.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={c.mutedForeground} />
            </Pressable>
          )}
        </View>

        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categories}
          >
            <Pressable
              style={[
                styles.categoryChip,
                !selectedCategory
                  ? { backgroundColor: colors.light.navy }
                  : { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 },
              ]}
              onPress={() => setSelectedCategory(undefined)}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: !selectedCategory ? "#fff" : c.mutedForeground },
                ]}
              >
                All
              </Text>
            </Pressable>
            {categories.map((cat: any) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.id
                    ? { backgroundColor: colors.light.navy }
                    : { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 },
                ]}
                onPress={() =>
                  setSelectedCategory((prev) => (prev === cat.id ? undefined : cat.id))
                }
              >
                <Text
                  style={[
                    styles.categoryText,
                    { color: selectedCategory === cat.id ? "#fff" : c.mutedForeground },
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => (
            <SkeletonYachtCard key={i} />
          ))}
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load yachts"
          subtitle="Check your connection and try again"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="boat-outline"
          title="No yachts found"
          subtitle={search ? "Try a different search term" : "No yachts available right now"}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <YachtCard
              yacht={item}
              onPress={() => router.push(`/(home)/yacht/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  waveIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  categories: {
    paddingVertical: 4,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  list: {
    padding: 16,
  },
});
