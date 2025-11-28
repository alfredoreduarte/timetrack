import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var selectedProjectId: String = ""
    @State private var selectedTaskId: String = ""
    @State private var description: String = ""

    var body: some View {
        VStack(spacing: AppTheme.spacingLG) {
            // Timer Display or Form
            if timerViewModel.isRunning, let entry = timerViewModel.currentEntry {
                // Active timer view - matching macOS layout
                VStack(spacing: AppTheme.spacingLG) {
                    // Project/task names at top
                    VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                        Text(entry.project?.name ?? "No Project")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.primary)
                            .lineLimit(1)

                        if let task = entry.task {
                            Text(task.name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(AppTheme.tertiary)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    // Timer and stop button on same row
                    HStack(alignment: .center) {
                        // Timer and earnings stacked
                        VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                            Text(timerViewModel.formattedElapsedTime)
                                .font(.system(size: 48, weight: .bold, design: .monospaced))
                                .foregroundColor(AppTheme.primary)

                            if let liveEarnings = timerViewModel.currentTimerLiveEarnings {
                                Text(String(format: "$%.2f", liveEarnings))
                                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                                    .foregroundColor(AppTheme.earnings)
                            }
                        }

                        Spacer()

                        // Stop button - circular like macOS
                        Button(action: {
                            Task {
                                await timerViewModel.stopTimer()
                            }
                        }) {
                            ZStack {
                                Circle()
                                    .fill(AppTheme.error)
                                    .frame(width: 56, height: 56)

                                if timerViewModel.isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    RoundedRectangle(cornerRadius: 4)
                                        .fill(Color.white)
                                        .frame(width: 20, height: 20)
                                }
                            }
                        }
                        .disabled(timerViewModel.isLoading)
                    }
                }

            } else {
                // Start timer form
                VStack(spacing: AppTheme.spacingXL) {
                    // Header
                    VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                        Text("Start Timer")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.primary)

                        Text("Track your time")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.tertiary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(spacing: AppTheme.spacingMD) {
                        // Project picker
                        VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                            Text("Project")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.primary)

                            Menu {
                                Button("No Project") {
                                    selectedProjectId = ""
                                }
                                ForEach(timerViewModel.projects) { project in
                                    Button(action: { selectedProjectId = project.id }) {
                                        HStack {
                                            Circle()
                                                .fill(Color(hex: project.color ?? "#808080") ?? .gray)
                                                .frame(width: 8, height: 8)
                                            Text(project.name)
                                        }
                                    }
                                }
                            } label: {
                                HStack {
                                    if selectedProjectId.isEmpty {
                                        Text("Select a project")
                                            .foregroundColor(AppTheme.tertiary)
                                    } else if let project = timerViewModel.projects.first(where: { $0.id == selectedProjectId }) {
                                        HStack(spacing: AppTheme.spacingSM) {
                                            Circle()
                                                .fill(Color(hex: project.color ?? "#808080") ?? .gray)
                                                .frame(width: 8, height: 8)
                                            Text(project.name)
                                                .foregroundColor(AppTheme.primary)
                                        }
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(AppTheme.tertiary)
                                }
                                .padding(AppTheme.spacingMD)
                                .background(AppTheme.backgroundElevated)
                                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                                        .stroke(AppTheme.border, lineWidth: 1)
                                )
                            }
                        }

                        // Task picker (only shown if project selected)
                        if !selectedProjectId.isEmpty && !timerViewModel.tasks.isEmpty {
                            VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                                Text("Task (Optional)")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(AppTheme.primary)

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
                                            Text("Select a task")
                                                .foregroundColor(AppTheme.tertiary)
                                        } else if let task = timerViewModel.tasks.first(where: { $0.id == selectedTaskId }) {
                                            Text(task.name)
                                                .foregroundColor(AppTheme.primary)
                                        }

                                        Spacer()

                                        Image(systemName: "chevron.down")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(AppTheme.tertiary)
                                    }
                                    .padding(AppTheme.spacingMD)
                                    .background(AppTheme.backgroundElevated)
                                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                                            .stroke(AppTheme.border, lineWidth: 1)
                                    )
                                }
                            }
                        }

                        // Description field
                        VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                            Text("Description (Optional)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.primary)

                            TextField("What are you working on?", text: $description)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.primary)
                                .padding(AppTheme.spacingMD)
                                .background(AppTheme.backgroundElevated)
                                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                                .overlay(
                                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                                        .stroke(AppTheme.border, lineWidth: 1)
                                )
                        }

                        // Error message
                        if let errorMessage = timerViewModel.errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(AppTheme.error)
                        }

                        // Start button
                        Button(action: {
                            startTimer()
                        }) {
                            HStack(spacing: AppTheme.spacingSM) {
                                if timerViewModel.isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Image(systemName: "play.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                Text(timerViewModel.isLoading ? "Starting..." : "Start Timer")
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, AppTheme.spacingMD)
                            .background(canStartTimer ? AppTheme.successGradient : LinearGradient(colors: [AppTheme.tertiary], startPoint: .leading, endPoint: .trailing))
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                        }
                        .disabled(!canStartTimer || timerViewModel.isLoading)
                    }
                }
            }
        }
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
        .padding()
        .background(AppTheme.background)
}
