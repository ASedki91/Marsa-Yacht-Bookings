import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useListHostYachts } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonYachtCard } from "@/components/SkeletonCard";
import { YachtCard } from "@/components/YachtCard";
import colors from "@/constants/colors";

const STATUS_COLOR: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#92400E", bg: "#FEF3C7" },
  pending_review: { label: "Under Review", color: "#1E40AF", bg: "#DBEAFE" },
  live: { label: "Live", color: "#065F46", bg: "#D1FAE5" },
  changes_requested: { label: "Changes Needed", color: "#991B1B", bg: "#FEE2E2" },
  rejected: { label: "Rejected", color: "#991B1B", bg: "#FEE2E2" },
};

export default function MyYachtsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useListHostYachts();
  const yachts = (data as any)?.yachts ?? [];

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
        <Text style={[styles.title, { color: c.foreground }]}>My Yachts</Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.light.navy }]}
          onPress={() => Alert.alert("Coming Soon", "Yacht creation is available on the web dashboard.")}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Yacht</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[1, 2].map((i) => <SkeletonYachtCard key={i} />)}
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load yachts"
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : yachts.length === 0 ? (
        <EmptyState
          icon="boat-outline"
          title="No yachts yet"
          subtitle="List your first yacht on MARSA and start earning"
          actionLabel="Add Yacht"
          onAction={() => Alert.alert("Coming Soon", "Yacht creation is available on the web dashboard.")}
        />
      ) : (
        <FlatList
          data={yachts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const statusCfg = STATUS_COLOR[item.status] ?? { label: item.status, color: c.mutedForeground, bg: c.muted };
            return (
              <View>
                <YachtCard
                  yacht={item}
                  onPress={() => {}}
                />
                <View style={[styles.statusRow, { backgroundColor: statusCfg.bg }]}>
                  <Text style={[styles.statusText, { color: statusCfg.color }]}>
                    {statusCfg.label}
                  </Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16 },
  statusRow: {
    marginTop: -12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 1,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
