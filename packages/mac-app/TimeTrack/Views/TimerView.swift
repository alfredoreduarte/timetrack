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
                // Active timer view - redesigned to match screenshot
                VStack(spacing: 20) {
                    // Top section with project/task names and action buttons
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            // Project name
                            Text(entry.project?.name ?? "No Project")
                                .font(.title2)
                                .fontWeight(.bold)
                                .lineLimit(1)
                                .truncationMode(.tail)

                            // Task name
                            Text(entry.task?.name ?? "No Task")
                                .font(.title3)
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }

                        Spacer()

                        // Action buttons (settings and refresh) - smaller and vertically aligned
                        VStack(spacing: 8) {
                            Button(action: onSettings) {
                                Image(systemName: "gearshape")
                                    .font(.title3)
                            }
                            .buttonStyle(.plain)

                            Button(action: onRefresh) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.title3)
                                    .rotationEffect(.degrees(rotationDegrees))
                            }
                            .buttonStyle(.plain)
                            .disabled(isRefreshing)
                        }
                    }

                    // Timer and earnings section with stop button
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            // Large timer display
                            Text(timerViewModel.formattedElapsedTime)
                                .font(.system(size: 48, weight: .bold, design: .monospaced))
                                .foregroundColor(.primary)

                            // Earnings display
                            if let rate = entry.hourlyRateSnapshot, rate > 0 {
                                let earned = rate * Double(timerViewModel.elapsedTime) / 3600.0
                                Text(String(format: "$%.2f", earned))
                                    .font(.title)
                                    .fontWeight(.bold)
                                    .foregroundColor(.green)
                            }
                        }

                        Spacer()

                        // Stop button - red circle with white square inside
                        Button(action: {
                            Task {
                                await timerViewModel.stopTimer()
                                selectedProjectId = ""
                                selectedTaskId = ""
                                description = ""
                            }
                        }) {
                            ZStack {
                                // Red circle background
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 60, height: 60)

                                // White square inside
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white)
                                    .frame(width: 18, height: 18)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(timerViewModel.isLoading)
                    }
                }
                .padding(24)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(12)
            } else {
                // Timer form to start a new timer
                VStack(spacing: 12) {
                    // Description input
                    TextField("What are you working on?", text: $description)
                        .textFieldStyle(RoundedBorderTextFieldStyle())

                    // Stack pickers and button vertically
                    VStack(spacing: 10) {
                        // Project picker
                        Menu {
                            Button("No Project") {
                                selectedProjectId = ""
                                selectedTaskId = ""
                                Task {
                                    await timerViewModel.selectProject(nil)
                                }
                            }

                            ForEach(timerViewModel.projects.filter { $0.isActive }) { project in
                                Button(action: {
                                    selectedProjectId = project.id
                                    selectedTaskId = ""
                                    Task {
                                        await timerViewModel.selectProject(project.id)
                                    }
                                }) {
                                    HStack {
                                        Circle()
                                            .fill(timerViewModel.getProjectColor(for: project.id))
                                            .frame(width: 8, height: 8)
                                        Text(project.name)
                                    }
                                }
                            }
                        } label: {
                            HStack {
                                if selectedProjectId.isEmpty {
                                    Text("Project")
                                        .foregroundColor(.secondary)
                                } else {
                                    Circle()
                                        .fill(timerViewModel.getProjectColor(for: selectedProjectId))
                                        .frame(width: 8, height: 8)
                                    Text(timerViewModel.getProjectName(for: selectedProjectId))
                                        .lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Color(NSColor.controlBackgroundColor))
                            .cornerRadius(6)
                        }
                        .frame(maxWidth: .infinity)

                        // Task picker (only if project is selected)
                        if !selectedProjectId.isEmpty && !timerViewModel.tasks.isEmpty {
                            Menu {
                                Button("No Task") {
                                    selectedTaskId = ""
                                }

                                ForEach(timerViewModel.tasks) { task in
                                    Button(task.name) {
                                        selectedTaskId = task.id
                                    }
                                }
                            } label: {
                                HStack {
                                    if selectedTaskId.isEmpty {
                                        Text("Task")
                                            .foregroundColor(.secondary)
                                    } else {
                                        Text(timerViewModel.getTaskName(for: selectedTaskId))
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.down")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(Color(NSColor.controlBackgroundColor))
                                .cornerRadius(6)
                            }
                            .frame(maxWidth: .infinity)
                        }

                        // Start button
                        Button(action: {
                            Task {
                                await timerViewModel.startTimer(
                                    projectId: selectedProjectId.isEmpty ? nil : selectedProjectId,
                                    taskId: selectedTaskId.isEmpty ? nil : selectedTaskId,
                                    description: description.isEmpty ? nil : description
                                )
                            }
                        }) {
                            HStack {
                                Image(systemName: "play.fill")
                                Text("Start")
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(6)
                        }
                        .disabled(timerViewModel.isLoading)
                    }
                }
            }

            // Error message
            if let errorMessage = timerViewModel.errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
            }
        }
        .onAppear {
            // Pre-select the first active project if available
            if selectedProjectId.isEmpty, let firstProject = timerViewModel.projects.first(where: { $0.isActive }) {
                selectedProjectId = firstProject.id
                Task {
                    await timerViewModel.selectProject(firstProject.id)
                }
            }
        }
    }
}

#Preview {
    TimerView()
        .environmentObject(TimerViewModel())
}