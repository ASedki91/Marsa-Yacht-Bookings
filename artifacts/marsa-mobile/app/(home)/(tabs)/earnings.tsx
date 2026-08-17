import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetHostEarnings,
  useListWithdrawals,
  useRequestWithdrawal,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";
import colors from "@/constants/colors";

function StatCard({
  label,
  amount,
  color,
  icon,
}: {
  label: string;
  amount: string;
  color: string;
  icon: string;
}) {
  const c = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statLabel, { color: c.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statAmount, { color: c.foreground }]}>
        EGP {Number(amount || 0).toLocaleString("en-EG")}
      </Text>
    </View>
  );
}

export default function EarningsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankDetails, setBankDetails] = useState("");

  const { data: earningsData, refetch: refetchEarnings } = useGetHostEarnings();
  const { data: withdrawalsData, refetch: refetchWithdrawals } = useListWithdrawals();
  const requestWithdrawal = useRequestWithdrawal();

  const earnings = (earningsData as any) ?? {};
  const ledger = earnings.ledger ?? [];
  const withdrawals = (withdrawalsData as any)?.withdrawals ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchEarnings(), refetchWithdrawals()]);
    setRefreshing(false);
  }, [refetchEarnings, refetchWithdrawals]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid withdrawal amount.");
      return;
    }
    try {
      await requestWithdrawal.mutateAsync({
        amountEgp: withdrawAmount,
        bankDetails,
      } as any);
      setShowWithdraw(false);
      setWithdrawAmount("");
      setBankDetails("");
      await refetchWithdrawals();
      Alert.alert("Withdrawal Requested", "Your withdrawal request has been submitted.");
    } catch (e) {
      Alert.alert("Error", "Could not process withdrawal. Please try again.");
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 12, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 80 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: c.foreground }]}>Earnings</Text>
          <Pressable
            style={[
              styles.withdrawBtn,
              {
                backgroundColor:
                  parseFloat(earnings.availableEgp || "0") > 0 ? colors.light.navy : c.muted,
              },
            ]}
            onPress={() =>
              parseFloat(earnings.availableEgp || "0") > 0
                ? setShowWithdraw(true)
                : Alert.alert("No funds", "You have no available funds to withdraw.")
            }
          >
            <Ionicons name="arrow-up-circle-outline" size={16} color={parseFloat(earnings.availableEgp || "0") > 0 ? "#fff" : c.mutedForeground} />
            <Text
              style={[
                styles.withdrawBtnText,
                { color: parseFloat(earnings.availableEgp || "0") > 0 ? "#fff" : c.mutedForeground },
              ]}
            >
              Withdraw
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.dashboardBanner, { backgroundColor: colors.light.navy }]}
          onPress={() => router.push("/(home)/host/(tabs)/dashboard" as any)}
        >
          <View style={styles.dashboardBannerLeft}>
            <Ionicons name="grid-outline" size={20} color={colors.light.gold} />
            <View>
              <Text style={styles.dashboardBannerTitle}>Host Dashboard</Text>
              <Text style={styles.dashboardBannerSub}>Bookings overview & quick actions</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>

        <View style={styles.statsGrid}>
          <StatCard label="Total Earned" amount={earnings.totalEarnedEgp || "0"} color={colors.light.ocean} icon="trending-up-outline" />
          <StatCard label="Available" amount={earnings.availableEgp || "0"} color="#10B981" icon="checkmark-circle-outline" />
          <StatCard label="Pending" amount={earnings.pendingEgp || "0"} color={colors.light.gold} icon="time-outline" />
          <StatCard label="Withdrawn" amount={earnings.withdrawnEgp || "0"} color={c.mutedForeground} icon="arrow-up-circle-outline" />
        </View>

        {ledger.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>Transaction History</Text>
            {ledger.map((item: any) => (
              <View
                key={item.id}
                style={[styles.ledgerRow, { backgroundColor: c.card, borderColor: c.border }]}
              >
                <View style={[styles.ledgerIcon, { backgroundColor: item.type === "earnings" ? "#D1FAE5" : "#FEE2E2" }]}>
                  <Ionicons
                    name={item.type === "earnings" ? "arrow-down-outline" : "arrow-up-outline"}
                    size={16}
                    color={item.type === "earnings" ? "#065F46" : "#991B1B"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ledgerType, { color: c.foreground }]}>
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                  </Text>
                  <Text style={[styles.ledgerDate, { color: c.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString("en-EG", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: item.type === "earnings" ? "#065F46" : "#991B1B" }]}>
                  {item.type === "earnings" ? "+" : "-"}EGP {Number(item.amountEgp).toLocaleString("en-EG")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {withdrawals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>Withdrawal Requests</Text>
            {withdrawals.map((w: any) => (
              <View key={w.id} style={[styles.ledgerRow, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.ledgerType, { color: c.foreground }]}>
                  EGP {Number(w.amountEgp).toLocaleString("en-EG")}
                </Text>
                <Text style={[styles.statusBadge, { color: w.status === "approved" ? "#065F46" : c.mutedForeground }]}>
                  {w.status}
                </Text>
              </View>
            ))}
          </View>
        )}

        {ledger.length === 0 && (
          <EmptyState
            icon="cash-outline"
            title="No earnings yet"
            subtitle="Accept bookings to start earning"
          />
        )}
      </ScrollView>

      <Modal visible={showWithdraw} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: c.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>Request Withdrawal</Text>
            <Pressable onPress={() => setShowWithdraw(false)}>
              <Ionicons name="close" size={24} color={c.foreground} />
            </Pressable>
          </View>

          <View style={[styles.availableBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.availableLabel, { color: c.mutedForeground }]}>Available Balance</Text>
            <Text style={[styles.availableAmount, { color: c.foreground }]}>
              EGP {Number(earnings.availableEgp || 0).toLocaleString("en-EG")}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: c.foreground }]}>Amount (EGP)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Enter amount"
              placeholderTextColor={c.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: c.foreground }]}>Bank / Payment Details</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
              value={bankDetails}
              onChangeText={setBankDetails}
              placeholder="Account name, number, bank name..."
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={3}
            />
          </View>

          <Pressable
            style={[styles.confirmBtn, { backgroundColor: colors.light.navy, opacity: requestWithdrawal.isPending ? 0.7 : 1 }]}
            onPress={handleWithdraw}
            disabled={requestWithdrawal.isPending}
          >
            {requestWithdrawal.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>Submit Request</Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Marcellus_400Regular" },
  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  withdrawBtnText: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  dashboardBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, padding: 14, gap: 12,
  },
  dashboardBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  dashboardBannerTitle: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold", color: "#fff" },
  dashboardBannerSub: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", color: "#94A3B8", marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 12, fontFamily: "HankenGrotesk_500Medium" },
  statAmount: { fontSize: 16, fontFamily: "HankenGrotesk_700Bold" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: "Marcellus_400Regular" },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  ledgerIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  ledgerType: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
  ledgerDate: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular" },
  ledgerAmount: { fontSize: 14, fontFamily: "HankenGrotesk_700Bold" },
  statusBadge: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold", textTransform: "capitalize" },
  modal: { flex: 1, padding: 20, gap: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  modalTitle: { fontSize: 20, fontFamily: "Marcellus_400Regular" },
  availableBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  availableLabel: { fontSize: 13, fontFamily: "HankenGrotesk_500Medium" },
  availableAmount: { fontSize: 24, fontFamily: "HankenGrotesk_700Bold" },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: "HankenGrotesk_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "HankenGrotesk_400Regular" },
  multiline: { height: 80, textAlignVertical: "top" },
  confirmBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  confirmBtnText: { color: "#fff", fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold" },
});
