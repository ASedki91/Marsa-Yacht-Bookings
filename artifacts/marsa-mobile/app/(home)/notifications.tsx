import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";

export default function NotificationsScreen() {
  const c = useColors();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useListNotifications({});
  const markRead = useMarkNotificationRead();

  const notifications = (data as any)?.notifications ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleRead = async (id: string) => {
    try {
      await markRead.mutateAsync({ id });
      refetch();
    } catch {}
  };

  if (isLoading) return null;

  if (error || notifications.length === 0) {
    return (
      <EmptyState
        icon="notifications-outline"
        title="No notifications"
        subtitle="You're all caught up!"
      />
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={[
            styles.row,
            {
              backgroundColor: item.isRead ? c.card : c.primary + "10",
              borderColor: c.border,
            },
          ]}
          onPress={() => !item.isRead && handleRead(item.id)}
        >
          <View
            style={[
              styles.iconBox,
              { backgroundColor: item.isRead ? c.muted : c.primary + "20" },
            ]}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={item.isRead ? c.mutedForeground : c.primary}
            />
          </View>
          <View style={styles.content}>
            <Text style={[styles.title, { color: c.foreground }]}>{item.title}</Text>
            <Text style={[styles.message, { color: c.mutedForeground }]} numberOfLines={2}>
              {item.message}
            </Text>
            <Text style={[styles.time, { color: c.mutedForeground }]}>
              {new Date(item.createdAt).toLocaleDateString("en-EG", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          {!item.isRead && (
            <View style={[styles.dot, { backgroundColor: c.primary }]} />
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  message: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", lineHeight: 18 },
  time: { fontSize: 11, fontFamily: "HankenGrotesk_400Regular", marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
