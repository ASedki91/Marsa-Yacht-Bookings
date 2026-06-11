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
import { useListHostYachts, useDeleteHostYacht } from "@workspace/api-client-react";
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

const EDITABLE = ["draft", "changes_requested", "rejected"];

export default function MyYachtsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useListHostYachts();
  const yachts = (data as any)?.yachts ?? [];
  const deleteYacht = useDeleteHostYacht();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEdit = (item: any) => {
    router.push(`/(home)/new-yacht?editId=${item.id}`);
  };

  const handleDelete = (item: any) => {
    Alert.alert(
      "Delete Yacht",
      `Are you sure you want to delete "${item.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteYacht.mutateAsync({ id: item.id });
              refetch();
            } catch {
              Alert.alert("Error", "Could not delete yacht. Only draft or rejected listings can be deleted.");
            }
          },
        },
      ],
    );
  };

  const handlePress = (item: any) => {
    if (EDITABLE.includes(item.status)) {
      router.push(`/(home)/new-yacht?editId=${item.id}`);
    } else {
      router.push(`/(home)/yacht/${item.id}`);
    }
  };

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
          onPress={() => router.push("/(home)/new-yacht")}
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
          actionLabel="List Your Yacht"
          onAction={() => router.push("/(home)/new-yacht")}
        />
      ) : (
        <FlatList
          data={yachts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const statusCfg = STATUS_COLOR[item.status] ?? { label: item.status, color: c.mutedForeground, bg: c.muted };
            const canEdit = EDITABLE.includes(item.status);
            return (
              <View>
                <YachtCard
                  yacht={item}
                  onPress={() => handlePress(item)}
                />
                <View style={[styles.statusRow, { backgroundColor: statusCfg.bg }]}>
                  <Text style={[styles.statusText, { color: statusCfg.color }]}>
                    {statusCfg.label}
                  </Text>
                  {canEdit && (
                    <View style={styles.actionBtns}>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.light.navy + "18" }]}
                        onPress={() => handleEdit(item)}
                      >
                        <Ionicons name="pencil-outline" size={14} color={colors.light.navy} />
                        <Text style={[styles.actionBtnText, { color: colors.light.navy }]}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#991B1B" />
                        <Text style={[styles.actionBtnText, { color: "#991B1B" }]}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionBtns: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
