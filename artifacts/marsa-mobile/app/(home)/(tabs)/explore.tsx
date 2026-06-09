import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  ScrollView, RefreshControl, Platform, Modal, Switch,
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

const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "capacity_asc", label: "Capacity: Low to High" },
  { key: "capacity_desc", label: "Capacity: High to Low" },
];

const CAPACITY_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "2+", value: 2 },
  { label: "4+", value: 4 },
  { label: "8+", value: 8 },
  { label: "12+", value: 12 },
];

interface FilterState {
  sort: string;
  minCapacity: number;
  maxPriceEgp: string;
}

const DEFAULT_FILTERS: FilterState = { sort: "newest", minCapacity: 0, maxPriceEgp: "" };

function FilterModal({
  visible,
  filters,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: FilterState;
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const [draft, setDraft] = useState<FilterState>(filters);

  const reset = () => setDraft(DEFAULT_FILTERS);
  const apply = () => { onApply(draft); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[fStyles.container, { backgroundColor: c.background }]}>
        <View style={[fStyles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose}><Text style={[fStyles.cancel, { color: c.primary }]}>Cancel</Text></Pressable>
          <Text style={[fStyles.title, { color: c.foreground }]}>Filter & Sort</Text>
          <Pressable onPress={reset}><Text style={[fStyles.reset, { color: c.mutedForeground }]}>Reset</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={fStyles.content}>
          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>Sort By</Text>
          <View style={fStyles.sortOptions}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  fStyles.sortOption,
                  {
                    backgroundColor: draft.sort === opt.key ? colors.light.navy + "15" : c.card,
                    borderColor: draft.sort === opt.key ? colors.light.navy : c.border,
                  },
                ]}
                onPress={() => setDraft((d) => ({ ...d, sort: opt.key }))}
              >
                {draft.sort === opt.key && (
                  <Ionicons name="checkmark-circle" size={16} color={colors.light.navy} />
                )}
                <Text style={[fStyles.sortLabel, { color: draft.sort === opt.key ? colors.light.navy : c.foreground }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>Minimum Capacity</Text>
          <View style={fStyles.capacityRow}>
            {CAPACITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  fStyles.capacityChip,
                  {
                    backgroundColor: draft.minCapacity === opt.value ? colors.light.navy : c.muted,
                    borderColor: draft.minCapacity === opt.value ? colors.light.navy : c.border,
                  },
                ]}
                onPress={() => setDraft((d) => ({ ...d, minCapacity: opt.value }))}
              >
                <Text style={[fStyles.capacityText, { color: draft.minCapacity === opt.value ? "#fff" : c.foreground }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>Max Price (EGP)</Text>
          <TextInput
            style={[fStyles.priceInput, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
            value={draft.maxPriceEgp}
            onChangeText={(v) => setDraft((d) => ({ ...d, maxPriceEgp: v.replace(/[^0-9]/g, "") }))}
            placeholder="No limit"
            placeholderTextColor={c.mutedForeground}
            keyboardType="numeric"
          />
          <Text style={[fStyles.priceNote, { color: c.mutedForeground }]}>
            Per booking (based on the shortest available slot)
          </Text>
        </ScrollView>

        <View style={[fStyles.footer, { borderTopColor: c.border }]}>
          <Pressable style={[fStyles.applyBtn, { backgroundColor: colors.light.navy }]} onPress={apply}>
            <Text style={fStyles.applyBtnText}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const fStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  cancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  reset: { fontSize: 15, fontFamily: "Inter_400Regular" },
  content: { padding: 20, gap: 16 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sortOptions: { gap: 8 },
  sortOption: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  sortLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  capacityRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  capacityChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  capacityText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  priceInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  priceNote: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -8 },
  footer: { padding: 16, borderTopWidth: 1 },
  applyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  applyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function sortYachts(yachts: any[], sort: string): any[] {
  const arr = [...yachts];
  switch (sort) {
    case "price_asc": return arr.sort((a, b) => Number(a.minPriceEgp ?? 0) - Number(b.minPriceEgp ?? 0));
    case "price_desc": return arr.sort((a, b) => Number(b.minPriceEgp ?? 0) - Number(a.minPriceEgp ?? 0));
    case "capacity_asc": return arr.sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0));
    case "capacity_desc": return arr.sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
    default: return arr;
  }
}

export default function ExploreScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [layout, setLayout] = useState<"list" | "grid">("list");

  const { data: categoriesData } = useListCategories();
  const categories = (categoriesData as any)?.categories ?? [];

  const { data, isLoading, error, refetch } = useListYachts({
    limit: 40,
    categoryId: selectedCategory,
  });

  const yachts = (data as any)?.yachts ?? [];

  const hasFilters = filters.sort !== "newest" || filters.minCapacity > 0 || !!filters.maxPriceEgp;

  const filtered = (() => {
    let arr = [...yachts];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((y: any) =>
        (y.title ?? y.name ?? "").toLowerCase().includes(q) ||
        y.description?.toLowerCase().includes(q) ||
        y.location?.toLowerCase().includes(q)
      );
    }
    if (filters.minCapacity > 0) {
      arr = arr.filter((y: any) => (y.capacity ?? 0) >= filters.minCapacity);
    }
    if (filters.maxPriceEgp) {
      const max = Number(filters.maxPriceEgp);
      arr = arr.filter((y: any) => Number(y.minPriceEgp ?? 0) <= max);
    }
    return sortYachts(arr, filters.sort);
  })();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FilterModal
        visible={showFilter}
        filters={filters}
        onApply={setFilters}
        onClose={() => setShowFilter(false)}
      />

      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: c.background, borderBottomColor: c.border }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { color: c.mutedForeground }]}>El Gouna, Egypt</Text>
            <Text style={[styles.title, { color: c.foreground }]}>Find Your Yacht</Text>
          </View>
          <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="boat" size={22} color={colors.light.gold} />
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { backgroundColor: c.input, borderColor: c.border, flex: 1 }]}>
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
          <Pressable
            style={[styles.filterBtn, { backgroundColor: hasFilters ? colors.light.navy : c.card, borderColor: c.border }]}
            onPress={() => setShowFilter(true)}
          >
            <Ionicons name="options-outline" size={18} color={hasFilters ? "#fff" : c.foreground} />
            {hasFilters && <View style={styles.filterDot} />}
          </Pressable>
          <Pressable
            style={[styles.filterBtn, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => setLayout((l) => l === "list" ? "grid" : "list")}
          >
            <Ionicons name={layout === "list" ? "grid-outline" : "list-outline"} size={18} color={c.foreground} />
          </Pressable>
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
                !selectedCategory ? { backgroundColor: colors.light.navy } : { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 },
              ]}
              onPress={() => setSelectedCategory(undefined)}
            >
              <Text style={[styles.categoryText, { color: !selectedCategory ? "#fff" : c.mutedForeground }]}>All</Text>
            </Pressable>
            {categories.map((cat: any) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat.id ? { backgroundColor: colors.light.navy } : { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 },
                ]}
                onPress={() => setSelectedCategory((prev) => (prev === cat.id ? undefined : cat.id))}
              >
                <Text style={[styles.categoryText, { color: selectedCategory === cat.id ? "#fff" : c.mutedForeground }]}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {hasFilters && (
          <View style={styles.activeFilters}>
            <Ionicons name="funnel-outline" size={13} color={c.primary} />
            <Text style={[styles.activeFiltersText, { color: c.primary }]}>
              {[
                filters.sort !== "newest" && SORT_OPTIONS.find((s) => s.key === filters.sort)?.label,
                filters.minCapacity > 0 && `${filters.minCapacity}+ guests`,
                filters.maxPriceEgp && `≤ EGP ${filters.maxPriceEgp}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Pressable onPress={() => setFilters(DEFAULT_FILTERS)} style={styles.clearFilters}>
              <Ionicons name="close-circle" size={14} color={c.primary} />
            </Pressable>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => <SkeletonYachtCard key={i} />)}
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
          subtitle={search || hasFilters ? "Try different search terms or filters" : "No yachts available right now"}
          actionLabel={hasFilters ? "Clear Filters" : undefined}
          onAction={hasFilters ? () => setFilters(DEFAULT_FILTERS) : undefined}
        />
      ) : (
        <FlatList
          data={filtered}
          key={layout}
          keyExtractor={(item) => item.id}
          numColumns={layout === "grid" ? 2 : 1}
          renderItem={({ item }) => (
            <View style={layout === "grid" ? styles.gridItem : undefined}>
              <YachtCard
                yacht={item}
                onPress={() => router.push(`/(home)/yacht/${item.id}`)}
                compact={layout === "grid"}
              />
            </View>
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: c.mutedForeground }]}>
              {filtered.length} yacht{filtered.length !== 1 ? "s" : ""} available
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  logoBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterDot: { position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.light.gold },
  categories: { gap: 8, paddingVertical: 2 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  activeFilters: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  activeFiltersText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  clearFilters: { padding: 2 },
  list: { padding: 16, gap: 12 },
  gridItem: { flex: 1, margin: 4 },
  resultCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
});
