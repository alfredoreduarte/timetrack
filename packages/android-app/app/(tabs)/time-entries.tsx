import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import Toast from "react-native-toast-message";
import { useAppDispatch, useAppSelector } from "../../src/hooks/useTypedDispatch";
import {
  fetchTimeEntries,
  deleteTimeEntry,
} from "../../src/store/slices/timeEntriesSlice";
import { TimeEntryCard } from "../../src/components/TimeEntryCard";
import { colors } from "../../src/theme/colors";
import { spacing, fontSize } from "../../src/theme/spacing";

export default function TimeEntriesScreen() {
  const dispatch = useAppDispatch();
  const { entries, pagination, loading } = useAppSelector(
    (state) => state.timeEntries
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchTimeEntries({ page: 1, limit: 20 }));
  }, [dispatch]);

  const handleRefresh = () => {
    setPage(1);
    dispatch(fetchTimeEntries({ page: 1, limit: 20 }));
  };

  const handleLoadMore = () => {
    if (page < pagination.pages && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      dispatch(fetchTimeEntries({ page: nextPage, limit: 20 }));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteTimeEntry(id)).unwrap();
      Toast.show({ type: "success", text1: "Entry deleted" });
    } catch {
      Toast.show({ type: "error", text1: "Failed to delete entry" });
    }
  };

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TimeEntryCard entry={item} onDelete={() => handleDelete(item.id)} />
      )}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No time entries yet.</Text>
      }
      ListFooterComponent={
        pagination.total > 0 ? (
          <Text style={styles.footerText}>
            {entries.length} of {pagination.total} entries
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
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxl,
  },
  footerText: {
    textAlign: "center",
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    paddingVertical: spacing.lg,
  },
});
