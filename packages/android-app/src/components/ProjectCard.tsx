import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { Project } from "../services/api";

interface ProjectCardProps {
  project: Project;
  onPress: () => void;
  onEdit?: () => void;
  taskCount?: number;
}

export const ProjectCard = ({
  project,
  onPress,
  onEdit,
  taskCount,
}: ProjectCardProps) => (
  <Pressable style={styles.card} onPress={onPress}>
    <View style={styles.row}>
      <View style={styles.leftContent}>
        <View style={styles.nameRow}>
          <View
            style={[
              styles.colorDot,
              { backgroundColor: project.color || colors.textTertiary },
            ]}
          />
          <Text style={styles.name} numberOfLines={1}>
            {project.name}
          </Text>
        </View>
        {project.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {project.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {project.hourlyRate != null && (
            <Text style={styles.meta}>${project.hourlyRate}/hr</Text>
          )}
          {taskCount != null && (
            <Text style={styles.meta}>
              {taskCount} task{taskCount !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.rightContent}>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Ionicons
              name="pencil-outline"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textTertiary}
        />
      </View>
    </View>
  </Pressable>
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  leftContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  rightContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.text,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 18,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
    marginLeft: 18,
    gap: spacing.md,
  },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
});
