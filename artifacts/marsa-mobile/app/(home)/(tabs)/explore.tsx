import React, { useState, useCallback, useEffect } from "react";
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
  Modal,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListYachts,
  useListCategories,
  useListBookingTemplates,
  useListLocations,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { YachtCard } from "@/components/YachtCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonYachtCard } from "@/components/SkeletonCard";
import {
  addDaysToDateKey,
  DateMatrixPicker,
  toLocalDateKey,
} from "@/components/DateMatrixPicker";
import colors from "@/constants/colors";
import { useWishlist } from "@/hooks/useWishlist";
import { MarsaLogo } from "@/components/MarsaLogo";

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

const FEATURE_OPTIONS = [
  "Air Conditioning",
  "Swimming Platform",
  "Snorkeling Gear",
  "Fishing Equipment",
  "Bluetooth Sound System",
  "BBQ Grill",
  "GPS Navigation",
  "WiFi",
  "Sun Deck",
  "Kitchenette",
  "Life Jackets",
];

function formatDateLabel(dateStr: string): string {
  const today = new Date();
  const d = new Date(dateStr + "T12:00:00");
  const diff = Math.round(
    (d.getTime() -
      new Date(today.toISOString().slice(0, 10) + "T12:00:00").getTime()) /
      86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-EG", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface FilterState {
  sort: string;
  minCapacity: number;
  maxPriceEgp: string;
  date: string;
  templateId: string;
  features: string[];
}

const DEFAULT_FILTERS: FilterState = {
  sort: "newest",
  minCapacity: 0,
  maxPriceEgp: "",
  date: "",
  templateId: "",
  features: [],
};

function FilterModal({
  visible,
  filters,
  templates,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: FilterState;
  templates: any[];
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const [draft, setDraft] = useState<FilterState>(filters);
  const todayDate = toLocalDateKey(new Date());
  const maximumFilterDate = addDaysToDateKey(todayDate, 7);

  const reset = () => setDraft(DEFAULT_FILTERS);
  const apply = () => {
    onApply(draft);
    onClose();
  };

  const toggleFeature = (f: string) => {
    setDraft((d) => ({
      ...d,
      features: d.features.includes(f)
        ? d.features.filter((x) => x !== f)
        : [...d.features, f],
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[fStyles.container, { backgroundColor: c.background }]}>
        <View style={[fStyles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose}>
            <Text style={[fStyles.cancel, { color: c.primary }]}>Cancel</Text>
          </Pressable>
          <Text style={[fStyles.title, { color: c.foreground }]}>
            Filter & Sort
          </Text>
          <Pressable onPress={reset}>
            <Text style={[fStyles.reset, { color: c.mutedForeground }]}>
              Reset
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={fStyles.content}>
          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
            Sort By
          </Text>
          <View style={fStyles.sortOptions}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  fStyles.sortOption,
                  {
                    backgroundColor:
                      draft.sort === opt.key
                        ? colors.light.navy + "15"
                        : c.card,
                    borderColor:
                      draft.sort === opt.key ? colors.light.navy : c.border,
                  },
                ]}
                onPress={() => setDraft((d) => ({ ...d, sort: opt.key }))}
              >
                {draft.sort === opt.key && (
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.light.navy}
                  />
                )}
                <Text
                  style={[
                    fStyles.sortLabel,
                    {
                      color:
                        draft.sort === opt.key
                          ? colors.light.navy
                          : c.foreground,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
            Date
          </Text>
          <Pressable
            style={[
              fStyles.anyDate,
              {
                backgroundColor: !draft.date ? c.primary + "12" : c.card,
                borderColor: !draft.date ? c.primary : c.border,
              },
            ]}
            onPress={() => setDraft((d) => ({ ...d, date: "" }))}
          >
            <Ionicons name="calendar-clear-outline" size={18} color={c.primary} />
            <Text style={[fStyles.anyDateText, { color: c.foreground }]}>Any date</Text>
            {!draft.date && (
              <Ionicons name="checkmark-circle" size={20} color={c.primary} />
            )}
          </Pressable>
          <DateMatrixPicker
            value={draft.date}
            minimumDate={todayDate}
            maximumDate={maximumFilterDate}
            accessibilityLabel="Filter yachts by date"
            onChange={(date) => setDraft((current) => ({ ...current, date }))}
          />

          {templates.length > 0 && (
            <>
              <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
                Duration
              </Text>
              <View style={fStyles.chipRow}>
                <Pressable
                  style={[
                    fStyles.templateChip,
                    {
                      backgroundColor: !draft.templateId
                        ? colors.light.navy
                        : c.card,
                      borderColor: !draft.templateId
                        ? colors.light.navy
                        : c.border,
                    },
                  ]}
                  onPress={() => setDraft((d) => ({ ...d, templateId: "" }))}
                >
                  <Text
                    style={[
                      fStyles.dateChipText,
                      { color: !draft.templateId ? "#fff" : c.foreground },
                    ]}
                  >
                    Any
                  </Text>
                </Pressable>
                {templates.map((t: any) => (
                  <Pressable
                    key={t.id}
                    style={[
                      fStyles.templateChip,
                      {
                        backgroundColor:
                          draft.templateId === t.id
                            ? colors.light.navy
                            : c.card,
                        borderColor:
                          draft.templateId === t.id
                            ? colors.light.navy
                            : c.border,
                      },
                    ]}
                    onPress={() =>
                      setDraft((d) => ({ ...d, templateId: t.id }))
                    }
                  >
                    <Text
                      style={[
                        fStyles.dateChipText,
                        {
                          color:
                            draft.templateId === t.id ? "#fff" : c.foreground,
                        },
                      ]}
                    >
                      {t.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
            Minimum Capacity
          </Text>
          <View style={fStyles.capacityRow}>
            {CAPACITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  fStyles.capacityChip,
                  {
                    backgroundColor:
                      draft.minCapacity === opt.value
                        ? colors.light.navy
                        : c.muted,
                    borderColor:
                      draft.minCapacity === opt.value
                        ? colors.light.navy
                        : c.border,
                  },
                ]}
                onPress={() =>
                  setDraft((d) => ({ ...d, minCapacity: opt.value }))
                }
              >
                <Text
                  style={[
                    fStyles.capacityText,
                    {
                      color:
                        draft.minCapacity === opt.value ? "#fff" : c.foreground,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
            Max Price (EGP)
          </Text>
          <TextInput
            style={[
              fStyles.priceInput,
              {
                backgroundColor: c.input,
                color: c.foreground,
                borderColor: c.border,
              },
            ]}
            value={draft.maxPriceEgp}
            onChangeText={(v) =>
              setDraft((d) => ({ ...d, maxPriceEgp: v.replace(/[^0-9]/g, "") }))
            }
            placeholder="No limit"
            placeholderTextColor={c.mutedForeground}
            keyboardType="numeric"
          />
          <Text style={[fStyles.priceNote, { color: c.mutedForeground }]}>
            Per booking (based on the shortest available slot)
          </Text>

          <Text style={[fStyles.sectionTitle, { color: c.foreground }]}>
            Features & Amenities
          </Text>
          <View style={fStyles.featuresGrid}>
            {FEATURE_OPTIONS.map((f) => (
              <Pressable
                key={f}
                style={[
                  fStyles.featureChip,
                  {
                    backgroundColor: draft.features.includes(f)
                      ? colors.light.navy + "15"
                      : c.card,
                    borderColor: draft.features.includes(f)
                      ? colors.light.navy
                      : c.border,
                  },
                ]}
                onPress={() => toggleFeature(f)}
              >
                {draft.features.includes(f) && (
                  <Ionicons
                    name="checkmark-circle"
                    size={13}
                    color={colors.light.navy}
                  />
                )}
                <Text
                  style={[
                    fStyles.featureChipText,
                    {
                      color: draft.features.includes(f)
                        ? colors.light.navy
                        : c.foreground,
                    },
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={[fStyles.footer, { borderTopColor: c.border }]}>
          <Pressable
            style={[fStyles.applyBtn, { backgroundColor: colors.light.navy }]}
            onPress={apply}
          >
            <Text style={fStyles.applyBtnText}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const fStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Marcellus_400Regular" },
  cancel: { fontSize: 15, fontFamily: "HankenGrotesk_400Regular" },
  reset: { fontSize: 15, fontFamily: "HankenGrotesk_400Regular" },
  content: { padding: 20, gap: 16 },
  sectionTitle: { fontSize: 15, fontFamily: "Marcellus_400Regular" },
  sortOptions: { gap: 8 },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortLabel: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  anyDate: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  anyDateText: { flex: 1, fontSize: 13, fontFamily: "HankenGrotesk_600SemiBold" },
  dateChipText: { fontSize: 13, fontFamily: "HankenGrotesk_500Medium" },
  templateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  capacityRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  capacityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  capacityText: { fontSize: 13, fontFamily: "HankenGrotesk_500Medium" },
  priceInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "HankenGrotesk_400Regular",
  },
  priceNote: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", marginTop: -8 },
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  featureChipText: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  footer: { padding: 16, borderTopWidth: 1 },
  applyBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  applyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "HankenGrotesk_600SemiBold",
  },
});

function sortYachts(yachts: any[], sort: string): any[] {
  const arr = [...yachts];
  switch (sort) {
    case "price_asc":
      return arr.sort(
        (a, b) => Number(a.basePriceEgp ?? 0) - Number(b.basePriceEgp ?? 0),
      );
    case "price_desc":
      return arr.sort(
        (a, b) => Number(b.basePriceEgp ?? 0) - Number(a.basePriceEgp ?? 0),
      );
    case "capacity_asc":
      return arr.sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0));
    case "capacity_desc":
      return arr.sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0));
    default:
      return arr;
  }
}

export default function ExploreScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    locationId?: string | string[];
    date?: string | string[];
    intent?: string | string[];
  }>();
  const routeLocationId = Array.isArray(params.locationId)
    ? params.locationId[0]
    : params.locationId;
  const routeDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    string | undefined
  >();
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | undefined
  >(routeLocationId);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    date: routeDate ?? "",
  });
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const wishlist = useWishlist();

  const { data: categoriesData } = useListCategories();
  const { data: templatesData } = useListBookingTemplates();
  const { data: locationsData } = useListLocations();
  const categories = (categoriesData as any)?.categories ?? [];
  const templates = (templatesData as any)?.templates ?? [];
  const locations = (locationsData as any)?.locations ?? [];
  const selectedLocation = locations.find(
    (location: any) => location.id === selectedLocationId,
  );

  useEffect(() => {
    setSelectedLocationId(routeLocationId);
  }, [routeLocationId]);

  useEffect(() => {
    if (!routeDate) return;
    setFilters((current) => ({ ...current, date: routeDate }));
  }, [routeDate]);

  const { data, isLoading, error, refetch } = useListYachts({
    limit: 40,
    categoryId: selectedCategory,
    date: filters.date || undefined,
    templateId: filters.templateId || undefined,
    features:
      filters.features.length > 0 ? filters.features.join(",") : undefined,
    capacity: filters.minCapacity > 0 ? filters.minCapacity : undefined,
    maxPrice: filters.maxPriceEgp ? Number(filters.maxPriceEgp) : undefined,
    locationId: selectedLocationId,
    intent: "rent",
  } as any);

  useFocusEffect(
    useCallback(() => {
      void refetch();
      void wishlist.refetch();
    }, [refetch, wishlist.refetch]),
  );

  const yachts = (data as any)?.yachts ?? [];

  const hasFilters =
    filters.sort !== "newest" ||
    filters.minCapacity > 0 ||
    !!filters.maxPriceEgp ||
    !!filters.date ||
    !!filters.templateId ||
    filters.features.length > 0;

  const filtered = (() => {
    let arr = [...yachts];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (y: any) =>
          (y.title ?? y.name ?? "").toLowerCase().includes(q) ||
          y.description?.toLowerCase().includes(q) ||
          y.location?.toLowerCase().includes(q),
      );
    }
    return sortYachts(arr, filters.sort);
  })();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const activeFilterLabels = [
    filters.sort !== "newest" &&
      SORT_OPTIONS.find((s) => s.key === filters.sort)?.label,
    filters.date && formatDateLabel(filters.date),
    filters.templateId &&
      templates.find((t: any) => t.id === filters.templateId)?.name,
    filters.minCapacity > 0 && `${filters.minCapacity}+ guests`,
    filters.maxPriceEgp && `≤ EGP ${filters.maxPriceEgp}`,
    filters.features.length > 0 &&
      `${filters.features.length} feature${filters.features.length > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FilterModal
        visible={showFilter}
        filters={filters}
        templates={templates}
        onApply={setFilters}
        onClose={() => setShowFilter(false)}
      />

      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <View style={styles.headerTop}>
          <View>
            <Pressable
              onPress={() => router.push("/(home)/guest/(tabs)/home" as any)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons
                name="location-outline"
                size={13}
                color={c.mutedForeground}
              />
              <Text style={[styles.greeting, { color: c.mutedForeground }]}>
                {selectedLocation
                  ? `${selectedLocation.name}, ${selectedLocation.country}`
                  : "All locations"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={c.mutedForeground}
              />
            </Pressable>
            <Text style={[styles.title, { color: c.foreground }]}>
              Find Your Yacht
            </Text>
          </View>
          <View style={styles.logoBox}>
            <MarsaLogo size={44} />
          </View>
        </View>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: c.input, borderColor: c.border, flex: 1 },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={c.mutedForeground}
            />
            <TextInput
              style={[styles.searchInput, { color: c.foreground }]}
              placeholder="Search yachts..."
              placeholderTextColor={c.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={c.mutedForeground}
                />
              </Pressable>
            )}
          </View>
          <Pressable
            style={[
              styles.filterBtn,
              {
                backgroundColor: hasFilters ? colors.light.navy : c.card,
                borderColor: c.border,
              },
            ]}
            onPress={() => setShowFilter(true)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={hasFilters ? "#fff" : c.foreground}
            />
            {hasFilters && <View style={styles.filterDot} />}
          </Pressable>
          <Pressable
            style={[
              styles.filterBtn,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
            onPress={() => setLayout((l) => (l === "list" ? "grid" : "list"))}
          >
            <Ionicons
              name={layout === "list" ? "grid-outline" : "list-outline"}
              size={18}
              color={c.foreground}
            />
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
                !selectedCategory
                  ? { backgroundColor: colors.light.navy }
                  : {
                      backgroundColor: c.muted,
                      borderColor: c.border,
                      borderWidth: 1,
                    },
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
                    : {
                        backgroundColor: c.muted,
                        borderColor: c.border,
                        borderWidth: 1,
                      },
                ]}
                onPress={() =>
                  setSelectedCategory((prev) =>
                    prev === cat.id ? undefined : cat.id,
                  )
                }
              >
                <Text
                  style={[
                    styles.categoryText,
                    {
                      color:
                        selectedCategory === cat.id
                          ? "#fff"
                          : c.mutedForeground,
                    },
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {hasFilters && (
          <View style={styles.activeFilters}>
            <Ionicons name="funnel-outline" size={13} color={c.primary} />
            <Text
              style={[styles.activeFiltersText, { color: c.primary }]}
              numberOfLines={1}
            >
              {activeFilterLabels}
            </Text>
            <Pressable
              onPress={() => setFilters(DEFAULT_FILTERS)}
              style={styles.clearFilters}
            >
              <Ionicons name="close-circle" size={14} color={c.primary} />
            </Pressable>
          </View>
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
          subtitle={
            search || hasFilters
              ? "Try different search terms or filters"
              : "No yachts available right now"
          }
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
                wishlisted={wishlist.ids.has(item.id)}
                wishlistPending={wishlist.isPending(item.id)}
                onToggleWishlist={() =>
                  wishlist.toggle(item.id).catch(() => {})
                }
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: c.mutedForeground }]}>
              {filtered.length} yacht{filtered.length !== 1 ? "s" : ""}{" "}
              available
            </Text>
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
  greeting: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular" },
  title: { fontSize: 26, fontFamily: "Marcellus_400Regular" },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "HankenGrotesk_400Regular",
    paddingVertical: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.light.gold,
  },
  categories: { gap: 8, paddingVertical: 2 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  categoryText: { fontSize: 13, fontFamily: "HankenGrotesk_500Medium" },
  activeFilters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  activeFiltersText: { flex: 1, fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  clearFilters: { padding: 2 },
  list: { padding: 16, gap: 12 },
  gridItem: { flex: 1, margin: 4 },
  resultCount: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_400Regular",
    marginBottom: 4,
  },
});
