import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { DailyData } from "../store/slices/reportsSlice";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHART_HEIGHT = 160;

interface WeeklyChartProps {
  data: DailyData[];
}

export const WeeklyChart = ({ data }: WeeklyChartProps) => {
  const maxDuration = Math.max(...data.map((d) => d.totalDuration), 1);

  return (
    <View style={styles.container}>
      <View style={styles.chart}>
        {data.map((day, index) => {
          const barHeight = (day.totalDuration / maxDuration) * CHART_HEIGHT;
          const hours = (day.totalDuration / 3600).toFixed(1);
          return (
            <View key={day.date} style={styles.barContainer}>
              <Text style={styles.barLabel}>
                {day.totalDuration > 0 ? `${hours}h` : ""}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(barHeight, day.totalDuration > 0 ? 4 : 0),
                    },
                  ]}
                />
              </View>
              <Text style={styles.dayLabel}>{DAY_LABELS[index]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: CHART_HEIGHT + 40,
  },
  barContainer: {
    flex: 1,
    alignItems: "center",
  },
  barLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    marginBottom: 4,
    height: 14,
  },
  barTrack: {
    height: CHART_HEIGHT,
    width: 24,
    justifyContent: "flex-end",
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  bar: {
    width: 24,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  dayLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
