import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12, 0, 0, 0);
}

function monthDays(month: Date) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

interface DateMatrixPickerProps {
  value: string;
  onChange: (date: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  accessibilityLabel?: string;
}

export function DateMatrixPicker({
  value,
  onChange,
  minimumDate = toLocalDateKey(new Date()),
  maximumDate,
  accessibilityLabel = "Choose a date",
}: DateMatrixPickerProps) {
  const palette = useColors();
  const initialDate = value || minimumDate || toLocalDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(parseDateKey(initialDate)),
  );

  useEffect(() => {
    if (value) setVisibleMonth(startOfMonth(parseDateKey(value)));
  }, [value]);

  const days = useMemo(() => monthDays(visibleMonth), [visibleMonth]);
  const minimumMonth = startOfMonth(parseDateKey(minimumDate));
  const maximumMonth = maximumDate
    ? startOfMonth(parseDateKey(maximumDate))
    : undefined;
  const canGoBack = visibleMonth.getTime() > minimumMonth.getTime();
  const canGoForward =
    !maximumMonth || visibleMonth.getTime() < maximumMonth.getTime();

  const moveMonth = (offset: number) => {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1, 12),
    );
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        { backgroundColor: palette.card, borderColor: palette.border },
      ]}
    >
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          disabled={!canGoBack}
          hitSlop={8}
          onPress={() => moveMonth(-1)}
          style={({ pressed }) => [
            styles.monthButton,
            {
              backgroundColor: palette.input,
              opacity: canGoBack ? (pressed ? 0.65 : 1) : 0.28,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.foreground} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: palette.foreground }]}>
          {visibleMonth.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          disabled={!canGoForward}
          hitSlop={8}
          onPress={() => moveMonth(1)}
          style={({ pressed }) => [
            styles.monthButton,
            {
              backgroundColor: palette.input,
              opacity: canGoForward ? (pressed ? 0.65 : 1) : 0.28,
            },
          ]}
        >
          <Ionicons name="chevron-forward" size={18} color={palette.foreground} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday) => (
          <Text
            key={weekday}
            style={[styles.weekday, { color: palette.mutedForeground }]}
          >
            {weekday}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const key = toLocalDateKey(day);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          const isSelected = value === key;
          const isDisabled =
            !isCurrentMonth ||
            key < minimumDate ||
            (!!maximumDate && key > maximumDate);

          return (
            <View key={key} style={styles.daySlot}>
              <Pressable
                accessibilityLabel={day.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                accessibilityRole="button"
                accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                disabled={isDisabled}
                onPress={() => onChange(key)}
                style={({ pressed }) => [
                  styles.dayButton,
                  isSelected && { backgroundColor: colors.light.navy },
                  !isSelected && pressed && { backgroundColor: palette.input },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: isSelected
                        ? "#FFFFFF"
                        : isDisabled
                          ? palette.mutedForeground + "55"
                          : palette.foreground,
                    },
                  ]}
                >
                  {day.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  monthHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontFamily: "Marcellus_400Regular",
    fontSize: 15,
  },
  weekRow: { flexDirection: "row", marginBottom: 3 },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    fontFamily: "SpaceMono_700Bold",
    fontSize: 9,
    textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  daySlot: {
    width: "14.2857%",
    aspectRatio: 1,
    padding: 2,
  },
  dayButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontFamily: "HankenGrotesk_600SemiBold", fontSize: 13 },
});
