import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { Task } from "../services/api";

interface TaskCardProps {
  task: Task;
  onToggleComplete?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const TaskCard = ({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
}: TaskCardProps) => (
  <View style={styles.card}>
    <View style={styles.row}>
      <Pressable onPress={onToggleComplete} hitSlop={8} style={styles.checkArea}>
        <Ionicons
          name={task.isCompleted ? "checkbox" : "square-outline"}
          size={22}
          color={task.isCompleted ? colors.success : colors.textTertiary}
        />
      </Pressable>
      <View style={styles.content}>
        <Text
          style={[styles.name, task.isCompleted && styles.completed]}
          numberOfLines={1}
        >
          {task.name}
        </Text>
        {task.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {task.description}
          </Text>
        ) : null}
        {task.hourlyRate != null && (
          <Text style={styles.rate}>${task.hourlyRate}/hr</Text>
        )}
      </View>
      <View style={styles.actions}>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Ionicons
              name="pencil-outline"
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
        {onDelete && (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </Pressable>
        )}
      </View>
    </View>
  </View>
);

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
    alignItems: "center",
  },
  checkArea: {
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: "500",
    color: colors.text,
  },
  completed: {
    textDecorationLine: "line-through",
    color: colors.textTertiary,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rate: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
});
