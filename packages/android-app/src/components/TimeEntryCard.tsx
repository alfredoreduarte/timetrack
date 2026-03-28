import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { formatTime, formatReportsDuration } from "../utils/dateTime";
import { TimeEntry } from "../services/api";

interface TimeEntryCardProps {
  entry: TimeEntry;
  onPress?: () => void;
  onDelete?: () => void;
}

export const TimeEntryCard = ({ entry, onPress, onDelete }: TimeEntryCardProps) => {
  const projectColor = entry.project?.color || colors.textTertiary;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.leftContent}>
          {entry.project && (
            <View style={styles.projectRow}>
              <View
                style={[styles.colorDot, { backgroundColor: projectColor }]}
              />
              <Text style={styles.projectName} numberOfLines={1}>
                {entry.project.name}
              </Text>
            </View>
          )}
          {entry.task && (
            <Text style={styles.taskName} numberOfLines={1}>
              {entry.task.name}
            </Text>
          )}
          {entry.description && (
            <Text style={styles.description} numberOfLines={1}>
              {entry.description}
            </Text>
          )}
          <Text style={styles.timeRange}>
            {formatTime(entry.startTime)}
            {entry.endTime ? ` - ${formatTime(entry.endTime)}` : " - Running"}
          </Text>
        </View>
        <View style={styles.rightContent}>
          <Text style={styles.duration}>
            {entry.duration != null
              ? formatReportsDuration(entry.duration)
              : "..."}
          </Text>
          {entry.hourlyRateSnapshot != null && entry.duration != null && (
            <Text style={styles.earnings}>
              $
              {((entry.hourlyRateSnapshot * entry.duration) / 3600).toFixed(2)}
            </Text>
          )}
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  leftContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  rightContent: {
    alignItems: "flex-end",
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  projectName: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  taskName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  description: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  timeRange: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  duration: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  earnings: {
    fontSize: fontSize.xs,
    color: colors.success,
    marginTop: 2,
  },
  deleteBtn: {
    marginTop: spacing.sm,
  },
});
