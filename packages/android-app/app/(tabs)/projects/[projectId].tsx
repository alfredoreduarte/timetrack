import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useAppDispatch, useAppSelector } from "../../../src/hooks/useTypedDispatch";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
} from "../../../src/store/slices/projectsSlice";
import { TaskCard } from "../../../src/components/TaskCard";
import { colors } from "../../../src/theme/colors";
import { spacing, borderRadius, fontSize } from "../../../src/theme/spacing";
import { Task } from "../../../src/services/api";

export default function ProjectDetailScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const dispatch = useAppDispatch();
  const { projects, tasks } = useAppSelector((state) => state.projects);

  const project = projects.find((p) => p.id === projectId);
  const projectTasks = tasks.filter((t) => (t.projectId || t.project?.id) === projectId);

  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  useEffect(() => {
    if (projectId) {
      dispatch(fetchTasks({ projectId }));
    }
  }, [dispatch, projectId]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setHourlyRate("");
    setEditingTask(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !projectId) {
      Toast.show({ type: "error", text1: "Task name is required" });
      return;
    }

    try {
      if (editingTask) {
        await dispatch(
          updateTask({
            id: editingTask.id,
            data: {
              name: name.trim(),
              description: description.trim() || undefined,
              hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
            },
          })
        ).unwrap();
        Toast.show({ type: "success", text1: "Task updated" });
      } else {
        await dispatch(
          createTask({
            name: name.trim(),
            description: description.trim() || undefined,
            projectId,
            hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          })
        ).unwrap();
        Toast.show({ type: "success", text1: "Task created" });
      }
      setShowModal(false);
      resetForm();
    } catch {
      Toast.show({ type: "error", text1: "Failed to save task" });
    }
  };

  const handleToggleComplete = async (task: Task) => {
    try {
      await dispatch(
        updateTask({ id: task.id, data: { isCompleted: !task.isCompleted } })
      ).unwrap();
    } catch {
      Toast.show({ type: "error", text1: "Failed to update task" });
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setName(task.name);
    setDescription(task.description || "");
    setHourlyRate(task.hourlyRate?.toString() || "");
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteTask(id)).unwrap();
      Toast.show({ type: "success", text1: "Task deleted" });
    } catch {
      Toast.show({ type: "error", text1: "Failed to delete task" });
    }
  };

  return (
    <View style={styles.container}>
      {/* Project header */}
      {project && (
        <View style={styles.projectHeader}>
          <View style={styles.projectNameRow}>
            <View
              style={[
                styles.colorDot,
                { backgroundColor: project.color || colors.textTertiary },
              ]}
            />
            <Text style={styles.projectName}>{project.name}</Text>
          </View>
          {project.description && (
            <Text style={styles.projectDescription}>{project.description}</Text>
          )}
          {project.hourlyRate != null && (
            <Text style={styles.projectRate}>${project.hourlyRate}/hr</Text>
          )}
        </View>
      )}

      <FlatList
        data={projectTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onToggleComplete={() => handleToggleComplete(item)}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No tasks yet. Add one to organize your work!
          </Text>
        }
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => {
          resetForm();
          setShowModal(true);
        }}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      {/* Create/Edit Task Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingTask ? "Edit Task" : "New Task"}
            </Text>
            <Pressable onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Task name"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Hourly Rate ($)</Text>
            <TextInput
              style={styles.input}
              value={hourlyRate}
              onChangeText={setHourlyRate}
              placeholder="Override project rate"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />

            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>
                {editingTask ? "Update" : "Create"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  projectHeader: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  projectNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  projectName: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
  },
  projectDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginLeft: 20,
  },
  projectRate: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: spacing.xs,
    marginLeft: 20,
  },
  list: {
    padding: spacing.lg,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxl,
  },
  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
  },
  modalBody: {
    padding: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  saveText: {
    color: colors.textInverse,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
});
