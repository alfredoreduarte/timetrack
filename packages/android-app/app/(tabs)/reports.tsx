import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppDispatch, useAppSelector } from "../../src/hooks/useTypedDispatch";
import { fetchWeeklyData } from "../../src/store/slices/reportsSlice";
import { WeeklyChart } from "../../src/components/WeeklyChart";
import { colors } from "../../src/theme/colors";
import { spacing, borderRadius, fontSize } from "../../src/theme/spacing";
import { formatReportsDuration } from "../../src/utils/dateTime";

export default function ReportsScreen() {
  const dispatch = useAppDispatch();
  const { weeklyData, loading, currentWeekOffset } = useAppSelector(
    (state) => state.reports
  );

  useEffect(() => {
    dispatch(fetchWeeklyData(currentWeekOffset));
  }, [dispatch, currentWeekOffset]);

  const navigateWeek = (direction: -1 | 1) => {
    const newOffset = currentWeekOffset + direction;
    if (newOffset <= 0) {
      dispatch(fetchWeeklyData(newOffset));
    }
  };

  const formatWeekRange = () => {
    if (!weeklyData) return "";
    const start = new Date(weeklyData.weekStartDate);
    const end = new Date(weeklyData.weekEndDate);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", opts)}`;
  };

  const totalDuration = weeklyData?.dailyBreakdown.reduce(
    (sum, d) => sum + d.totalDuration,
    0
  ) || 0;

  const totalEarnings = weeklyData?.dailyBreakdown.reduce(
    (sum, d) => sum + d.totalEarnings,
    0
  ) || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => dispatch(fetchWeeklyData(currentWeekOffset))}
          tintColor={colors.primary}
        />
      }
    >
      {/* Week navigation */}
      <View style={styles.weekNav}>
        <Pressable
          style={styles.navButton}
          onPress={() => navigateWeek(-1)}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.weekRange}>
          {currentWeekOffset === 0 ? "This Week" : formatWeekRange()}
        </Text>
        <Pressable
          style={[
            styles.navButton,
            currentWeekOffset >= 0 && styles.navButtonDisabled,
          ]}
          onPress={() => navigateWeek(1)}
          disabled={currentWeekOffset >= 0}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={currentWeekOffset >= 0 ? colors.textTertiary : colors.primary}
          />
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Time</Text>
          <Text style={styles.summaryValue}>
            {formatReportsDuration(totalDuration)}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Earnings</Text>
          <Text style={styles.summaryValue}>${totalEarnings.toFixed(2)}</Text>
        </View>
      </View>

      {/* Chart */}
      {weeklyData && <WeeklyChart data={weeklyData.dailyBreakdown} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  weekNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  navButton: {
    padding: spacing.sm,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  weekRange: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.text,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xs,
  },
});
