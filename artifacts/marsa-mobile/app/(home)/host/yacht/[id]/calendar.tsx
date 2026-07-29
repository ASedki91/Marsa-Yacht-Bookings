import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetHostYacht,
  useGetHostYachtAvailability,
  useListBookingTemplates,
  useSetYachtAvailability,
} from "@workspace/api-client-react";

import colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_COLORS: Record<string, string> = {
  available: "#16A34A",
  booked: "#2563EB",
  held: "#D97706",
  blocked: "#64748B",
  past: "#94A3B8",
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

function displayTime(value: string) {
  const [hoursText, minutes = "00"] = value.split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${suffix}`;
}

export default function YachtCalendarScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const yachtId = Array.isArray(params.id) ? params.id[0] : params.id;
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const days = useMemo(() => calendarDays(month), [month]);
  const from = dateKey(days[0]);
  const to = dateKey(days[days.length - 1]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [priceOverride, setPriceOverride] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [editorError, setEditorError] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const yachtQuery = useGetHostYacht(yachtId!, {
    query: { enabled: !!yachtId } as any,
  });
  const templatesQuery = useListBookingTemplates();
  const slotsQuery = useGetHostYachtAvailability(
    { yachtId: yachtId!, from, to },
    { query: { enabled: !!yachtId } as any },
  );
  const saveMutation = useSetYachtAvailability();
  const yacht = yachtQuery.data as any;
  const templates: any[] = (templatesQuery.data as any)?.templates ?? [];
  const slots: any[] = (slotsQuery.data as any)?.slots ?? [];
  const selectedSlots = slots
    .filter((slot) => slot.date === selectedDate)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));

  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const slot of slots) {
      const current = grouped.get(slot.date) ?? [];
      current.push(slot);
      grouped.set(slot.date, current);
    }
    return grouped;
  }, [slots]);

  const openNewSlot = () => {
    if (selectedDate < todayKey) return;
    setEditingSlot(null);
    setTemplateId(templates[0]?.id ?? "");
    setStartTime("09:00");
    setPriceOverride("");
    setIsAvailable(true);
    setEditorError("");
    setDeleteConfirming(false);
    setEditorOpen(true);
  };

  const openExistingSlot = (slot: any) => {
    if (!slot.editable) {
      if (slot.bookingId) router.push(`/(home)/booking/${slot.bookingId}`);
      return;
    }
    setEditingSlot(slot);
    setTemplateId(slot.templateId);
    setStartTime(slot.startTime.slice(0, 5));
    setPriceOverride(slot.priceOverrideEgp ?? "");
    setIsAvailable(slot.isAvailable);
    setEditorError("");
    setDeleteConfirming(false);
    setEditorOpen(true);
  };

  const saveSlot = async () => {
    setEditorError("");
    if (!templateId) {
      setEditorError("Choose a booking duration.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setEditorError("Use a 24-hour time such as 09:00 or 14:30.");
      return;
    }
    const normalizedPrice = priceOverride.trim().replace(/,/g, "");
    if (
      normalizedPrice &&
      (!/^\d+(\.\d{1,2})?$/.test(normalizedPrice) ||
        Number(normalizedPrice) <= 0)
    ) {
      setEditorError("Enter a positive EGP amount with up to 2 decimals.");
      return;
    }

    try {
      await saveMutation.mutateAsync({
        id: yachtId!,
        data: {
          upsert: [
            {
              ...(editingSlot?.id ? { id: editingSlot.id } : {}),
              templateId,
              date: selectedDate,
              startTime: `${startTime}:00`,
              isAvailable,
              priceOverrideEgp: normalizedPrice || null,
            },
          ],
        },
      });
      setEditorOpen(false);
      await slotsQuery.refetch();
    } catch (error: any) {
      setEditorError(
        error?.data?.error ??
          error?.errors?.[0]?.message ??
          error?.message ??
          "The slot may have changed. Refresh and try again.",
      );
    }
  };

  const deleteSlot = async () => {
    if (!editingSlot?.id || !editingSlot.editable) return;
    setEditorError("");
    try {
      await saveMutation.mutateAsync({
        id: yachtId!,
        data: { deleteIds: [editingSlot.id] },
      });
      setEditorOpen(false);
      setDeleteConfirming(false);
      await slotsQuery.refetch();
    } catch (error: any) {
      setEditorError(
        error?.data?.error ??
          error?.message ??
          "Booked and held slots cannot be deleted.",
      );
    }
  };

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const loading =
    yachtQuery.isLoading || templatesQuery.isLoading || slotsQuery.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 10,
            borderBottomColor: palette.border,
            backgroundColor: palette.background,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={[
            styles.headerButton,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Ionicons name="arrow-back" size={21} color={palette.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: palette.foreground }]}>
            Availability calendar
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerSubtitle, { color: palette.mutedForeground }]}
          >
            {yacht?.title ?? yacht?.name ?? "Your yacht"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh calendar"
          hitSlop={10}
          onPress={() => slotsQuery.refetch()}
          style={[
            styles.headerButton,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Ionicons name="refresh" size={20} color={palette.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : slotsQuery.error ? (
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={35}
            color={palette.mutedForeground}
          />
          <Text style={[styles.errorTitle, { color: palette.foreground }]}>
            Calendar could not be loaded
          </Text>
          <Pressable onPress={() => slotsQuery.refetch()}>
            <Text style={[styles.retryText, { color: palette.primary }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: Platform.OS === "web" ? 36 : insets.bottom + 30,
          }}
        >
          <View style={styles.monthBar}>
            <Pressable
              onPress={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              style={[
                styles.monthArrow,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={19}
                color={palette.foreground}
              />
            </Pressable>
            <Text style={[styles.monthTitle, { color: palette.foreground }]}>
              {month.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Pressable
              onPress={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              style={[
                styles.monthArrow,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={19}
                color={palette.foreground}
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.calendar,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}
          >
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => (
                <Text
                  key={weekday}
                  style={[styles.weekday, { color: palette.mutedForeground }]}
                >
                  {weekday}
                </Text>
              ))}
            </View>
            <View style={styles.dayGrid}>
              {days.map((day) => {
                const key = dateKey(day);
                const isCurrentMonth = day.getMonth() === month.getMonth();
                const isSelected = key === selectedDate;
                const isToday = key === todayKey;
                const daySlots = slotsByDate.get(key) ?? [];
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelectedDate(key)}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: colors.light.navy },
                      !isSelected &&
                        isToday && {
                          borderColor: palette.primary,
                          borderWidth: 1,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: isSelected
                            ? "#FFFFFF"
                            : isCurrentMonth
                              ? palette.foreground
                              : palette.mutedForeground + "80",
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                    <View style={styles.dots}>
                      {daySlots.slice(0, 3).map((slot) => (
                        <View
                          key={slot.id}
                          style={[
                            styles.dot,
                            {
                              backgroundColor:
                                STATUS_COLORS[slot.displayStatus] ??
                                palette.mutedForeground,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.legend}>
            {[
              ["available", "Available"],
              ["booked", "Booked"],
              ["held", "Payment hold"],
              ["blocked", "Blocked"],
            ].map(([status, label]) => (
              <View key={status} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: STATUS_COLORS[status] },
                  ]}
                />
                <Text
                  style={[
                    styles.legendText,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.daySection}>
            <View style={styles.dayHeader}>
              <View>
                <Text style={[styles.dayTitle, { color: palette.foreground }]}>
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                    "en-EG",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    },
                  )}
                </Text>
                <Text
                  style={[
                    styles.daySubtitle,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {selectedSlots.length
                    ? `${selectedSlots.length} time slot${selectedSlots.length === 1 ? "" : "s"}`
                    : "No time slots yet"}
                </Text>
              </View>
              <Pressable
                disabled={selectedDate < todayKey}
                onPress={openNewSlot}
                style={[
                  styles.addButton,
                  {
                    backgroundColor: colors.light.navy,
                    opacity: selectedDate < todayKey ? 0.4 : 1,
                  },
                ]}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add slot</Text>
              </Pressable>
            </View>

            {selectedSlots.length === 0 ? (
              <View
                style={[
                  styles.emptySlots,
                  {
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={27}
                  color={palette.mutedForeground}
                />
                <Text
                  style={[styles.emptyTitle, { color: palette.foreground }]}
                >
                  Nothing scheduled
                </Text>
                <Text
                  style={[styles.emptyCopy, { color: palette.mutedForeground }]}
                >
                  Add one or more start times and set a different price for each
                  slot.
                </Text>
              </View>
            ) : (
              <View style={styles.slotList}>
                {selectedSlots.map((slot) => {
                  const template = templates.find(
                    (item) => item.id === slot.templateId,
                  );
                  const statusColor =
                    STATUS_COLORS[slot.displayStatus] ??
                    palette.mutedForeground;
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => openExistingSlot(slot)}
                      style={[
                        styles.slotCard,
                        {
                          backgroundColor: palette.card,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.timeIcon,
                          { backgroundColor: statusColor + "18" },
                        ]}
                      >
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color={statusColor}
                        />
                      </View>
                      <View style={styles.slotCopy}>
                        <Text
                          style={[
                            styles.slotTime,
                            { color: palette.foreground },
                          ]}
                        >
                          {displayTime(slot.startTime)}
                        </Text>
                        <Text
                          style={[
                            styles.slotMeta,
                            { color: palette.mutedForeground },
                          ]}
                        >
                          {template?.name ?? "Booking slot"}
                          {template?.durationHours
                            ? ` · ${template.durationHours}h`
                            : ""}
                        </Text>
                      </View>
                      <View style={styles.slotRight}>
                        <Text
                          style={[
                            styles.slotPrice,
                            { color: palette.foreground },
                          ]}
                        >
                          {slot.effectivePriceEgp
                            ? `EGP ${Number(slot.effectivePriceEgp).toLocaleString("en-EG")}`
                            : "No price"}
                        </Text>
                        <Text
                          style={[styles.slotStatus, { color: statusColor }]}
                        >
                          {slot.displayStatus.replace("_", " ")}
                        </Text>
                      </View>
                      <Ionicons
                        name={
                          slot.editable ? "create-outline" : "chevron-forward"
                        }
                        size={18}
                        color={palette.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={editorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditorOpen(false)}
        >
          <Pressable
            style={[styles.editor, { backgroundColor: palette.background }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <View style={styles.editorHeader}>
              <View>
                <Text
                  style={[styles.editorTitle, { color: palette.foreground }]}
                >
                  {editingSlot ? "Edit time slot" : "Add time slot"}
                </Text>
                <Text
                  style={[
                    styles.editorDate,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                    "en-EG",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    },
                  )}
                </Text>
              </View>
              <Pressable onPress={() => setEditorOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={palette.foreground} />
              </Pressable>
            </View>

            <Text style={[styles.inputLabel, { color: palette.foreground }]}>
              Booking duration
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.templateRow}>
                {templates.map((template) => {
                  const selected = template.id === templateId;
                  return (
                    <Pressable
                      key={template.id}
                      onPress={() => setTemplateId(template.id)}
                      style={[
                        styles.templateChip,
                        {
                          backgroundColor: selected
                            ? colors.light.navy
                            : palette.card,
                          borderColor: selected
                            ? colors.light.navy
                            : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.templateName,
                          { color: selected ? "#FFFFFF" : palette.foreground },
                        ]}
                      >
                        {template.name}
                      </Text>
                      <Text
                        style={[
                          styles.templateDuration,
                          {
                            color: selected
                              ? "rgba(255,255,255,0.72)"
                              : palette.mutedForeground,
                          },
                        ]}
                      >
                        {template.durationHours} hours
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.twoColumns}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.inputLabel, { color: palette.foreground }]}
                >
                  Start time
                </Text>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                  placeholderTextColor={palette.mutedForeground}
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.input,
                      borderColor: palette.border,
                      color: palette.foreground,
                    },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.inputLabel, { color: palette.foreground }]}
                >
                  Price override
                </Text>
                <View
                  style={[
                    styles.priceInput,
                    {
                      backgroundColor: palette.input,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.currency,
                      { color: palette.mutedForeground },
                    ]}
                  >
                    EGP
                  </Text>
                  <TextInput
                    value={priceOverride}
                    onChangeText={setPriceOverride}
                    keyboardType="decimal-pad"
                    placeholder="Default"
                    placeholderTextColor={palette.mutedForeground}
                    style={[
                      styles.priceTextInput,
                      { color: palette.foreground },
                    ]}
                  />
                </View>
              </View>
            </View>
            <Text
              style={[styles.inputHint, { color: palette.mutedForeground }]}
            >
              Leave the override empty to use this yacht’s standard duration
              price.
            </Text>

            <View
              style={[
                styles.availabilityToggle,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.toggleTitle, { color: palette.foreground }]}
                >
                  Available to book
                </Text>
                <Text
                  style={[
                    styles.toggleCopy,
                    { color: palette.mutedForeground },
                  ]}
                >
                  Turn this off to block the slot without deleting it.
                </Text>
              </View>
              <Switch
                value={isAvailable}
                onValueChange={setIsAvailable}
                trackColor={{
                  false: palette.muted,
                  true: palette.primary + "80",
                }}
                thumbColor={
                  isAvailable ? palette.primary : palette.mutedForeground
                }
              />
            </View>

            {!!editorError && (
              <View
                accessibilityRole="alert"
                style={[
                  styles.errorBanner,
                  { backgroundColor: palette.destructive + "12" },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={palette.destructive}
                />
                <Text
                  style={[
                    styles.errorBannerText,
                    { color: palette.destructive },
                  ]}
                >
                  {editorError}
                </Text>
              </View>
            )}

            {deleteConfirming ? (
              <View
                style={[
                  styles.deleteConfirmation,
                  {
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.deleteConfirmationTitle,
                    { color: palette.foreground },
                  ]}
                >
                  Delete this time slot?
                </Text>
                <Text
                  style={[
                    styles.deleteConfirmationCopy,
                    { color: palette.mutedForeground },
                  ]}
                >
                  Guests will no longer be able to book it. This cannot be
                  undone.
                </Text>
                <View style={styles.editorActions}>
                  <Pressable
                    disabled={saveMutation.isPending}
                    onPress={() => setDeleteConfirming(false)}
                    style={[styles.keepButton, { borderColor: palette.border }]}
                  >
                    <Text
                      style={[
                        styles.keepButtonText,
                        { color: palette.foreground },
                      ]}
                    >
                      Keep slot
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={saveMutation.isPending}
                    onPress={deleteSlot}
                    style={[
                      styles.confirmDeleteButton,
                      {
                        backgroundColor: palette.destructive,
                        opacity: saveMutation.isPending ? 0.65 : 1,
                      },
                    ]}
                  >
                    {saveMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.confirmDeleteText}>
                          Delete slot
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.editorActions}>
                {!!editingSlot && (
                  <Pressable
                    disabled={saveMutation.isPending}
                    onPress={() => {
                      setEditorError("");
                      setDeleteConfirming(true);
                    }}
                    style={[
                      styles.deleteButton,
                      { borderColor: palette.destructive },
                    ]}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={palette.destructive}
                    />
                    <Text
                      style={[
                        styles.deleteText,
                        { color: palette.destructive },
                      ]}
                    >
                      Delete
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  disabled={saveMutation.isPending}
                  onPress={saveSlot}
                  style={[
                    styles.saveButton,
                    {
                      backgroundColor: colors.light.navy,
                      opacity: saveMutation.isPending ? 0.65 : 1,
                    },
                  ]}
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={19} color="#FFFFFF" />
                      <Text style={styles.saveText}>Save slot</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 19 },
  headerSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 30,
  },
  errorTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  retryText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 12,
  },
  monthArrow: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  calendar: {
    marginHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 8,
  },
  weekdayRow: { flexDirection: "row" },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    paddingVertical: 8,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.92,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumber: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  dots: { flexDirection: "row", gap: 2, minHeight: 4, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 13,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 10 },
  daySection: { paddingHorizontal: 16, marginTop: 25 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 13,
  },
  dayTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  daySubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  addButton: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  emptySlots: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginTop: 8 },
  emptyCopy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
  },
  slotList: { gap: 9 },
  slotCard: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  slotCopy: { flex: 1 },
  slotTime: { fontFamily: "Inter_700Bold", fontSize: 14 },
  slotMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  slotRight: { alignItems: "flex-end" },
  slotPrice: { fontFamily: "Inter_700Bold", fontSize: 12 },
  slotStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    textTransform: "capitalize",
    marginTop: 3,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.46)",
  },
  editor: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 18,
  },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 21,
  },
  editorTitle: { fontFamily: "Inter_700Bold", fontSize: 21 },
  editorDate: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  inputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 8,
  },
  templateRow: { flexDirection: "row", gap: 8, paddingBottom: 18 },
  templateChip: {
    minWidth: 124,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  templateName: { fontFamily: "Inter_700Bold", fontSize: 13 },
  templateDuration: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  twoColumns: { flexDirection: "row", gap: 11 },
  input: {
    height: 49,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  priceInput: {
    height: 49,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  currency: { fontFamily: "Inter_700Bold", fontSize: 10 },
  priceTextInput: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  inputHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7,
    marginBottom: 18,
  },
  availabilityToggle: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  toggleCopy: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 13,
    padding: 12,
    marginTop: 14,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
  },
  deleteConfirmation: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    marginTop: 16,
  },
  deleteConfirmationTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  deleteConfirmationCopy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  editorActions: { flexDirection: "row", gap: 10, marginTop: 19 },
  keepButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keepButtonText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  confirmDeleteButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  confirmDeleteText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  deleteButton: {
    minHeight: 49,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  deleteText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  saveButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
});
