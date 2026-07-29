import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetDiscoveryHome,
  useListLocations,
} from "@workspace/api-client-react";

import { YachtCard } from "@/components/YachtCard";
import colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useWishlist } from "@/hooks/useWishlist";

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSelectedDate(value: string) {
  if (!value) return "Any date";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-EG", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function GuestHomeScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const discovery = useGetDiscoveryHome();
  const locationQuery = useListLocations();
  const wishlist = useWishlist();
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const homeData: any = discovery.data;
  const locations: any[] = (locationQuery.data as any)?.locations ?? [];
  const rails: any[] = homeData?.rails ?? [];
  const selectedLocation = locations.find((location) => location.id === locationId);
  const topPad = Platform.OS === "web" ? 30 : insets.top;

  useEffect(() => {
    if (locationId || locations.length === 0) return;
    const preferredId =
      homeData?.defaultLocationId ??
      locations.find((location) => location.isDefault)?.id ??
      locations[0]?.id;
    if (preferredId) setLocationId(preferredId);
  }, [homeData?.defaultLocationId, locationId, locations]);

  const dateOptions = useMemo(() => {
    return Array.from({ length: 30 }, (_, index) => {
      const value = new Date();
      value.setDate(value.getDate() + index);
      return {
        value: localIsoDate(value),
        weekday: value.toLocaleDateString("en-US", { weekday: "short" }),
        day: String(value.getDate()),
        month: value.toLocaleDateString("en-US", { month: "short" }),
      };
    });
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      discovery.refetch(),
      locationQuery.refetch(),
      wishlist.refetch(),
    ]);
    setRefreshing(false);
  };

  const search = () => {
    router.push({
      pathname: "/(home)/guest/(tabs)/explore",
      params: {
        intent: "rent",
        ...(locationId ? { locationId } : {}),
        ...(date ? { date } : {}),
      },
    } as any);
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topPad + 14,
          paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 92,
        }}
      >
        <View style={styles.pageHeader}>
          <View>
            <Text style={[styles.kicker, { color: palette.primary }]}>
              EXPLORE THE RED SEA
            </Text>
            <Text style={[styles.heading, { color: palette.foreground }]}>
              Where will you sail?
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Notifications"
            onPress={() => router.push("/(home)/notifications")}
            style={[styles.notification, { backgroundColor: palette.card, borderColor: palette.border }]}
          >
            <Ionicons name="notifications-outline" size={22} color={palette.foreground} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchCard,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Pressable
            onPress={() => setLocationPickerOpen(true)}
            style={[styles.searchField, { borderBottomColor: palette.border }]}
          >
            <View style={[styles.fieldIcon, { backgroundColor: palette.primary + "14" }]}>
              <Ionicons name="location-outline" size={21} color={palette.primary} />
            </View>
            <View style={styles.fieldCopy}>
              <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
                WHERE
              </Text>
              <Text style={[styles.fieldValue, { color: palette.foreground }]}>
                {selectedLocation?.name ?? "Choose a location"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
          </Pressable>

          <Pressable
            onPress={() => setDatePickerOpen(true)}
            style={[styles.searchField, { borderBottomColor: palette.border }]}
          >
            <View style={[styles.fieldIcon, { backgroundColor: palette.primary + "14" }]}>
              <Ionicons name="calendar-outline" size={21} color={palette.primary} />
            </View>
            <View style={styles.fieldCopy}>
              <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
                WHEN
              </Text>
              <Text style={[styles.fieldValue, { color: palette.foreground }]}>
                {formatSelectedDate(date)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
          </Pressable>

          <View style={styles.intentBlock}>
            <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
              I WANT TO
            </Text>
            <View style={[styles.intentSelector, { backgroundColor: palette.muted }]}>
              <View style={[styles.intentActive, { backgroundColor: colors.light.navy }]}>
                <Ionicons name="time-outline" size={16} color="#FFFFFF" />
                <Text style={styles.intentActiveText}>Rent</Text>
              </View>
              <View
                accessibilityState={{ disabled: true }}
                style={styles.intentSoon}
              >
                <Ionicons name="lock-closed-outline" size={14} color={palette.mutedForeground} />
                <Text style={[styles.intentSoonText, { color: palette.mutedForeground }]}>
                  Buy
                </Text>
                <View style={[styles.soonPill, { backgroundColor: colors.light.gold + "24" }]}>
                  <Text style={styles.soonPillText}>SOON</Text>
                </View>
              </View>
            </View>
          </View>

          <Pressable
            disabled={!locationId}
            onPress={search}
            style={({ pressed }) => [
              styles.searchButton,
              {
                backgroundColor: colors.light.navy,
                opacity: !locationId ? 0.5 : pressed ? 0.86 : 1,
              },
            ]}
          >
            <Ionicons name="search" size={19} color="#FFFFFF" />
            <Text style={styles.searchButtonText}>Search available yachts</Text>
          </Pressable>
        </View>

        <View style={styles.discoveryHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
              Popular on MARSA
            </Text>
            <Text style={[styles.sectionSubtitle, { color: palette.mutedForeground }]}>
              Featured and frequently booked yachts by location
            </Text>
          </View>
        </View>

        {discovery.isLoading ? (
          <ActivityIndicator
            color={palette.primary}
            size="large"
            style={{ marginTop: 38 }}
          />
        ) : discovery.error ? (
          <View style={[styles.messageCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={palette.mutedForeground} />
            <Text style={[styles.messageTitle, { color: palette.foreground }]}>
              Discovery is unavailable
            </Text>
            <Pressable onPress={() => discovery.refetch()}>
              <Text style={[styles.retry, { color: palette.primary }]}>Try again</Text>
            </Pressable>
          </View>
        ) : rails.length === 0 ? (
          <View style={[styles.messageCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name="boat-outline" size={26} color={palette.mutedForeground} />
            <Text style={[styles.messageTitle, { color: palette.foreground }]}>
              Featured yachts will appear here
            </Text>
            <Text style={[styles.messageCopy, { color: palette.mutedForeground }]}>
              Search Explore to see every yacht currently available.
            </Text>
          </View>
        ) : (
          rails.map((rail) => (
            <View key={rail.location.id} style={styles.rail}>
              <View style={styles.railHeader}>
                <View>
                  <Text style={[styles.railTitle, { color: palette.foreground }]}>
                    {rail.location.name}
                  </Text>
                  <Text style={[styles.railSubtitle, { color: palette.mutedForeground }]}>
                    {rail.location.city}, {rail.location.country}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(home)/guest/(tabs)/explore",
                      params: { intent: "rent", locationId: rail.location.id },
                    } as any)
                  }
                >
                  <Text style={[styles.seeAll, { color: palette.primary }]}>See all</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              >
                {rail.listings.map((listing: any) => (
                  <YachtCard
                    key={listing.listingId}
                    compact
                    yacht={{
                      id: listing.yachtId,
                      title: listing.title,
                      location: listing.location,
                      capacity: listing.capacity,
                      basePriceEgp: listing.fromPriceEgp ?? undefined,
                      rating: Number(listing.rating),
                      reviewCount: listing.reviewCount,
                      photos: listing.primaryPhotoUrl
                        ? [{ url: listing.primaryPhotoUrl, isPrimary: true }]
                        : [],
                      isFeatured: listing.isFeatured,
                    }}
                    wishlisted={wishlist.ids.has(listing.yachtId)}
                    wishlistPending={wishlist.isPending(listing.yachtId)}
                    onToggleWishlist={() => wishlist.toggle(listing.yachtId).catch(() => {})}
                    onPress={() => router.push(`/(home)/yacht/${listing.yachtId}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={locationPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLocationPickerOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: palette.background }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: palette.foreground }]}>
              Choose a location
            </Text>
            {locations.map((location) => (
              <Pressable
                key={location.id}
                onPress={() => {
                  setLocationId(location.id);
                  setLocationPickerOpen(false);
                }}
                style={[
                  styles.locationOption,
                  {
                    backgroundColor:
                      location.id === locationId ? palette.primary + "12" : palette.card,
                    borderColor:
                      location.id === locationId ? palette.primary : palette.border,
                  },
                ]}
              >
                <View style={[styles.locationPin, { backgroundColor: palette.primary + "14" }]}>
                  <Ionicons name="location" size={18} color={palette.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locationName, { color: palette.foreground }]}>
                    {location.name}
                  </Text>
                  <Text style={[styles.locationMeta, { color: palette.mutedForeground }]}>
                    {location.city}, {location.country}
                  </Text>
                </View>
                {location.isDefault && (
                  <Text style={[styles.defaultLabel, { color: palette.primary }]}>DEFAULT</Text>
                )}
                {location.id === locationId && (
                  <Ionicons name="checkmark-circle" size={21} color={palette.primary} />
                )}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: palette.background }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: palette.foreground }]}>
              Choose a trip date
            </Text>
            <Pressable
              onPress={() => {
                setDate("");
                setDatePickerOpen(false);
              }}
              style={[
                styles.anyDate,
                {
                  backgroundColor: !date ? palette.primary + "12" : palette.card,
                  borderColor: !date ? palette.primary : palette.border,
                },
              ]}
            >
              <Ionicons name="calendar-clear-outline" size={19} color={palette.primary} />
              <Text style={[styles.locationName, { color: palette.foreground }]}>Any date</Text>
              {!date && <Ionicons name="checkmark-circle" size={21} color={palette.primary} />}
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.dateOptions}>
                {dateOptions.map((option) => {
                  const selected = option.value === date;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        setDate(option.value);
                        setDatePickerOpen(false);
                      }}
                      style={[
                        styles.dateOption,
                        {
                          backgroundColor: selected ? colors.light.navy : palette.card,
                          borderColor: selected ? colors.light.navy : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dateWeekday,
                          { color: selected ? "rgba(255,255,255,0.72)" : palette.mutedForeground },
                        ]}
                      >
                        {option.weekday}
                      </Text>
                      <Text style={[styles.dateDay, { color: selected ? "#FFFFFF" : palette.foreground }]}>
                        {option.day}
                      </Text>
                      <Text
                        style={[
                          styles.dateMonth,
                          { color: selected ? "rgba(255,255,255,0.72)" : palette.mutedForeground },
                        ]}
                      >
                        {option.month}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  kicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.25,
    marginBottom: 4,
  },
  heading: { fontFamily: "Inter_700Bold", fontSize: 27 },
  notification: {
    width: 45,
    height: 45,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchCard: {
    borderWidth: 1,
    borderRadius: 24,
    marginHorizontal: 16,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 67,
    borderBottomWidth: 1,
  },
  fieldIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldCopy: { flex: 1 },
  fieldLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  fieldValue: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  intentBlock: { gap: 8, paddingTop: 14 },
  intentSelector: { flexDirection: "row", padding: 4, borderRadius: 13 },
  intentActive: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  intentActiveText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  intentSoon: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  intentSoonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  soonPill: { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 3 },
  soonPillText: { color: "#9A6700", fontFamily: "Inter_700Bold", fontSize: 8 },
  searchButton: {
    minHeight: 51,
    borderRadius: 15,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  searchButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  discoveryHeader: { paddingHorizontal: 18, marginTop: 32, marginBottom: 18 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 21 },
  sectionSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  rail: { marginBottom: 28 },
  railHeader: {
    paddingHorizontal: 18,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  railTitle: { fontFamily: "Inter_700Bold", fontSize: 19 },
  railSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  seeAll: { fontFamily: "Inter_700Bold", fontSize: 13 },
  railContent: { paddingLeft: 18, paddingRight: 6 },
  messageCard: {
    marginHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 7,
  },
  messageTitle: { fontFamily: "Inter_700Bold", fontSize: 15, textAlign: "center" },
  messageCopy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  retry: { fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 3 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.42)",
  },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 36,
    maxHeight: "82%",
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 18,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 21, marginBottom: 16 },
  locationOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 9,
  },
  locationPin: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  locationName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  locationMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  defaultLabel: { fontFamily: "Inter_700Bold", fontSize: 9 },
  anyDate: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  dateOptions: { flexDirection: "row", gap: 9, paddingRight: 18 },
  dateOption: {
    width: 72,
    minHeight: 92,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateWeekday: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  dateDay: { fontFamily: "Inter_700Bold", fontSize: 25, marginVertical: 2 },
  dateMonth: { fontFamily: "Inter_500Medium", fontSize: 11 },
});
