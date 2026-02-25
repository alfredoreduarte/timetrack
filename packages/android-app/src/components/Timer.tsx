import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { useTimer } from "../hooks/useTimer";
import { useAppSelector } from "../hooks/useTypedDispatch";

export const Timer = () => {
  const { isRunning, currentEntry, elapsedTime, loading, startTimer, stopTimer, formatTime } =
    useTimer();
  const { projects } = useAppSelector((state) => state.projects);
  const { tasks } = useAppSelector((state) => state.projects);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectTasks = tasks.filter(
    (t) => (t.projectId || t.project?.id) === selectedProjectId && !t.isCompleted
  );
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const handleStart = async () => {
    try {
      await startTimer({
        projectId: selectedProjectId,
        taskId: selectedTaskId,
      });
    } catch {
      // Error handled in hook
    }
  };

  const handleStop = async () => {
    try {
      await stopTimer();
      setSelectedProjectId(undefined);
      setSelectedTaskId(undefined);
    } catch {
      // Error handled in hook
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTaskId(undefined);
  };

  return (
    <View style={styles.container}>
      {/* Timer display */}
      <Text style={[styles.timer, isRunning && styles.timerRunning]}>
        {formatTime(elapsedTime)}
      </Text>

      {/* Current entry info */}
      {isRunning && currentEntry && (
        <View style={styles.entryInfo}>
          {currentEntry.project && (
            <View style={styles.projectTag}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: currentEntry.project.color || colors.textTertiary },
                ]}
              />
              <Text style={styles.entryText} numberOfLines={1}>
                {currentEntry.project.name}
              </Text>
            </View>
          )}
          {currentEntry.task && (
            <Text style={styles.entryTaskText} numberOfLines={1}>
              {currentEntry.task.name}
            </Text>
          )}
        </View>
      )}

      {/* Project/task selector (when not running) */}
      {!isRunning && (
        <View style={styles.selectorRow}>
          <Pressable
            style={styles.selectorButton}
            onPress={() => setShowPicker(true)}
          >
            {selectedProject ? (
              <View style={styles.projectTag}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: selectedProject.color || colors.textTertiary },
                  ]}
                />
                <Text style={styles.selectorText} numberOfLines={1}>
                  {selectedProject.name}
                  {selectedTask ? ` / ${selectedTask.name}` : ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.selectorPlaceholder}>Select project...</Text>
            )}
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Start/Stop button */}
      <Pressable
        style={[
          styles.button,
          isRunning ? styles.stopButton : styles.startButton,
        ]}
        onPress={isRunning ? handleStop : handleStart}
        disabled={loading}
      >
        <Ionicons
          name={isRunning ? "stop" : "play"}
          size={20}
          color={colors.textInverse}
        />
        <Text style={styles.buttonText}>
          {loading ? "..." : isRunning ? "Stop" : "Start"}
        </Text>
      </Pressable>

      {/* Project/Task picker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Project</Text>
            <Pressable onPress={() => setShowPicker(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* No project option */}
          <Pressable
            style={styles.pickerItem}
            onPress={() => {
              setSelectedProjectId(undefined);
              setSelectedTaskId(undefined);
              setShowPicker(false);
            }}
          >
            <Text style={styles.pickerItemText}>No project</Text>
            {!selectedProjectId && (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            )}
          </Pressable>

          <FlatList
            data={projects.filter((p) => p.isActive)}
            keyExtractor={(item) => item.id}
            extraData={selectedProjectId}
            renderItem={({ item }) => (
              <View>
                <Pressable
                  style={[
                    styles.pickerItem,
                    selectedProjectId === item.id && styles.pickerItemSelected,
                  ]}
                  onPress={() => {
                    handleSelectProject(item.id);
                    // If no tasks, close immediately
                    const hasTasks = tasks.filter(
                      (t) => (t.projectId || t.project?.id) === item.id && !t.isCompleted
                    ).length > 0;
                    if (!hasTasks) {
                      setShowPicker(false);
                    }
                  }}
                >
                  <View style={styles.pickerProjectRow}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: item.color || colors.textTertiary },
                      ]}
                    />
                    <Text style={styles.pickerItemText}>{item.name}</Text>
                  </View>
                  {selectedProjectId === item.id && !selectedTaskId && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
                {/* Show tasks for selected project */}
                {selectedProjectId === item.id &&
                  projectTasks.map((task) => (
                    <Pressable
                      key={task.id}
                      style={[styles.pickerItem, styles.pickerTaskItem]}
                      onPress={() => {
                        setSelectedTaskId(task.id);
                        setShowPicker(false);
                      }}
                    >
                      <Text style={styles.pickerTaskText}>{task.name}</Text>
                      {selectedTaskId === task.id && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.primary}
                        />
                      )}
                    </Pressable>
                  ))}
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  timer: {
    fontSize: 48,
    fontWeight: "700",
    color: colors.timerStopped,
    fontVariant: ["tabular-nums"],
  },
  timerRunning: {
    color: colors.timerRunning,
  },
  entryInfo: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  projectTag: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  entryText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
  },
  entryTaskText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  selectorRow: {
    width: "100%",
    marginTop: spacing.md,
  },
  selectorButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
  },
  selectorText: {
    fontSize: fontSize.sm,
    color: colors.text,
    flex: 1,
  },
  selectorPlaceholder: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  startButton: {
    backgroundColor: colors.success,
  },
  stopButton: {
    backgroundColor: colors.error,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.surfaceSecondary,
  },
  pickerProjectRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pickerItemText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  pickerTaskItem: {
    paddingLeft: spacing.xxl + spacing.lg,
  },
  pickerTaskText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
