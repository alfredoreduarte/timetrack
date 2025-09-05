import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var selectedProjectId: String = ""
    @State private var selectedTaskId: String = ""
    @State private var description: String = ""

    // Callback functions and state for refresh/settings buttons
    let onRefresh: () -> Void
    let onSettings: () -> Void
    let rotationDegrees: Double
    let isRefreshing: Bool

    init(onRefresh: @escaping () -> Void = {}, onSettings: @escaping () -> Void = {}, rotationDegrees: Double = 0.0, isRefreshing: Bool = false) {
        self.onRefresh = onRefresh
        self.onSettings = onSettings
        self.rotationDegrees = rotationDegrees
        self.isRefreshing = isRefreshing
    }

    var body: some View {
        VStack(spacing: 16) {
            // Timer Display or Form
            if timerViewModel.isRunning, let entry = timerViewModel.currentEntry {
                // Active timer view
                VStack(spacing: 20) {
                    // Top section with project/task names and action buttons
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            // Project name
                            Text(entry.project?.name ?? "No Project")
                                .font(.title2)
                                .fontWeight(.bold)
                                .lineLimit(1)

                            // Task name
                            Text(entry.task?.name ?? "No Task")
                                .font(.title3)
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }

                        Spacer()

                        // Action buttons
                        HStack(spacing: 12) {
                            Button(action: onRefresh) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }
                            .rotationEffect(.degrees(rotationDegrees))
                            .disabled(isRefreshing)

                            Button(action: onSettings) {
                                Image(systemName: "gearshape")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }

                    // Timer display section
                    VStack(spacing: 16) {
                        // Big timer display
                        Text(timerViewModel.formattedElapsedTime)
                            .font(.system(size: 42, weight: .bold, design: .monospaced))
                            .foregroundColor(.primary)

                        // Live earnings if available
                        if let liveEarnings = timerViewModel.currentTimerLiveEarnings {
                            Text("$\(liveEarnings, specifier: "%.2f")")
                                .font(.title)
                                .fontWeight(.semibold)
                                .foregroundColor(.green)
                        }

                        // Description if available
                        if let desc = entry.description, !desc.isEmpty {
                            Text(desc)
                                .font(.body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    }

                    // Stop button
                    Button(action: {
                        Task {
                            await timerViewModel.stopTimer()
                        }
                    }) {
                        HStack {
                            if timerViewModel.isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }
                            Image(systemName: "stop.fill")
                            Text(timerViewModel.isLoading ? "Stopping..." : "Stop Timer")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(timerViewModel.isLoading)
                }
                .padding()

            } else {
                // Start timer form
                VStack(spacing: 20) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Start Timer")
                                .font(.title2)
                                .fontWeight(.bold)

                            Text("Track your time")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        // Action buttons
                        HStack(spacing: 12) {
                            Button(action: onRefresh) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }
                            .rotationEffect(.degrees(rotationDegrees))
                            .disabled(isRefreshing)

                            Button(action: onSettings) {
                                Image(systemName: "gearshape")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }

                    VStack(spacing: 16) {
                        // Project picker
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Project")
                                .font(.headline)
                                .foregroundColor(.primary)

                            Picker("Select Project", selection: $selectedProjectId) {
                                Text("No Project").tag("")
                                ForEach(timerViewModel.projects) { project in
                                    HStack {
                                        Circle()
                                            .fill(Color(hex: project.color ?? "#808080") ?? .gray)
                                            .frame(width: 8, height: 8)
                                        Text(project.name)
                                    }
                                    .tag(project.id)
                                }
                            }
                            .pickerStyle(MenuPickerStyle())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color(UIColor.secondarySystemBackground))
                            .cornerRadius(8)
                        }

                        // Task picker (only shown if project selected)
                        if !selectedProjectId.isEmpty && !timerViewModel.tasks.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Task (Optional)")
                                    .font(.headline)
                                    .foregroundColor(.primary)

                                Picker("Select Task", selection: $selectedTaskId) {
                                    Text("No Task").tag("")
                                    ForEach(timerViewModel.tasks) { task in
                                        Text(task.name).tag(task.id)
                                    }
                                }
                                .pickerStyle(MenuPickerStyle())
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color(UIColor.secondarySystemBackground))
                                .cornerRadius(8)
                            }
                        }

                        // Description field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Description (Optional)")
                                .font(.headline)
                                .foregroundColor(.primary)

                            TextField("What are you working on?", text: $description)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                        }

                        // Error message
                        if let errorMessage = timerViewModel.errorMessage {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.caption)
                        }

                        // Start button
                        Button(action: {
                            startTimer()
                        }) {
                            HStack {
                                if timerViewModel.isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Image(systemName: "play.fill")
                                Text(timerViewModel.isLoading ? "Starting..." : "Start Timer")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(canStartTimer ? Color.green : Color.gray)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(!canStartTimer || timerViewModel.isLoading)
                    }
                }
                .padding()
            }
        }
        .background(Color(UIColor.tertiarySystemBackground))
        .onAppear {
            // Initialize selected project if there's only one
            if timerViewModel.projects.count == 1 {
                selectedProjectId = timerViewModel.projects.first?.id ?? ""
            }
        }
        .onChange(of: selectedProjectId) { projectId in
            // Load tasks when project changes
            Task {
                await timerViewModel.selectProject(projectId.isEmpty ? nil : projectId)
            }
            selectedTaskId = "" // Reset task selection
        }
    }

    private var canStartTimer: Bool {
        !selectedProjectId.isEmpty
    }

    private func startTimer() {
        guard canStartTimer else { return }

        Task {
            await timerViewModel.startTimer(
                projectId: selectedProjectId.isEmpty ? nil : selectedProjectId,
                taskId: selectedTaskId.isEmpty ? nil : selectedTaskId,
                description: description.isEmpty ? nil : description
            )

            // Clear form after successful start
            if timerViewModel.isRunning {
                description = ""
            }
        }
    }
}

#Preview {
    TimerView()
        .environmentObject(TimerViewModel())
}