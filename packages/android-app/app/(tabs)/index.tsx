import React, { useEffect } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useAppDispatch, useAppSelector } from "../../src/hooks/useTypedDispatch";
import { useTimer } from "../../src/hooks/useTimer";
import { fetchProjects, fetchTasks } from "../../src/store/slices/projectsSlice";
import { fetchDashboardEarnings } from "../../src/store/slices/dashboardSlice";
import { fetchTimeEntries } from "../../src/store/slices/timeEntriesSlice";
import { Timer } from "../../src/components/Timer";
import { EarningsCard } from "../../src/components/EarningsCard";
import { TimeEntryCard } from "../../src/components/TimeEntryCard";
import { colors } from "../../src/theme/colors";
import { spacing, fontSize } from "../../src/theme/spacing";

export default function DashboardScreen() {
  const dispatch = useAppDispatch();
  const { initializeTimer } = useTimer();
  const { earnings, loading: dashboardLoading } = useAppSelector(
    (state) => state.dashboard
  );
  const { entries } = useAppSelector((state) => state.timeEntries);
  const recentEntries = entries.slice(0, 5);

  useEffect(() => {
    dispatch(fetchProjects());
    dispatch(fetchTasks({}));
    dispatch(fetchDashboardEarnings());
    dispatch(fetchTimeEntries({ limit: 10 }));
    initializeTimer();
  }, [dispatch, initializeTimer]);

  const handleRefresh = () => {
    dispatch(fetchDashboardEarnings());
    dispatch(fetchTimeEntries({ limit: 10 }));
    dispatch(fetchProjects());
    dispatch(fetchTasks({}));
  };

  const ListHeader = () => (
    <View>
      {/* Timer */}
      <Timer />

      {/* Earnings cards */}
      <View style={styles.earningsRow}>
        <EarningsCard
          title="Today"
          earnings={earnings?.today.earnings || 0}
          duration={earnings?.today.duration || 0}
        />
        <View style={{ width: spacing.sm }} />
        <EarningsCard
          title="This Week"
          earnings={earnings?.thisWeek.earnings || 0}
          duration={earnings?.thisWeek.duration || 0}
        />
      </View>

      {/* Recent entries header */}
      {recentEntries.length > 0 && (
        <Text style={styles.sectionTitle}>Recent Entries</Text>
      )}
    </View>
  );

  return (
    <FlatList
      data={recentEntries}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TimeEntryCard entry={item} />}
      ListHeaderComponent={ListHeader}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={dashboardLoading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        recentEntries.length === 0 ? (
          <Text style={styles.emptyText}>
            No time entries yet. Start a timer to begin tracking!
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  earningsRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xl,
  },
});
