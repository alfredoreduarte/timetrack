import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var selectedProjectId: String = ""
    @State private var selectedTaskId: String = ""
    @State private var description: String = ""
    @State private var showingProjectPicker = false

    var body: some View {
        VStack(spacing: 20) {
            // Timer Display
            VStack(spacing: 8) {
                Text(timerViewModel.formattedElapsedTime)
                    .font(.system(size: 48, weight: .bold, design: .monospaced))
                    .foregroundColor(timerViewModel.isRunning ? .green : .primary)

                if timerViewModel.isRunning, let entry = timerViewModel.currentEntry {
                    VStack(spacing: 4) {
                        HStack {
                            Circle()
                                .fill(timerViewModel.getProjectColor(for: entry))
                                .frame(width: 8, height: 8)

                            Text("Project: \(timerViewModel.getProjectName(for: entry))")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }

                        if entry.taskId != nil {
                            Text("Task: \(timerViewModel.getTaskName(for: entry))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        if let description = entry.description {
                            Text("Description: \(description)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            // Project and Task Selection (when not running)
            if !timerViewModel.isRunning {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Select Project")
                        .font(.headline)

                    Menu {
                        Button("No Project") {
                            selectedProjectId = ""
                            selectedTaskId = ""
                            Task {
                                await timerViewModel.selectProject(nil)
                            }
                        }

                        ForEach(timerViewModel.projects.filter { $0.isActive }) { project in
                            Button(project.name) {
                                selectedProjectId = project.id
                                selectedTaskId = ""
                                Task {
                                    await timerViewModel.selectProject(project.id)
                                }
                            }
                        }
                    } label: {
                        HStack {
                            if selectedProjectId.isEmpty {
                                Text("Select a project...")
                                    .foregroundColor(.secondary)
                            } else {
                                HStack {
                                    Circle()
                                        .fill(timerViewModel.getProjectColor(for: selectedProjectId))
                                        .frame(width: 12, height: 12)

                                    Text(timerViewModel.getProjectName(for: selectedProjectId))
                                        .foregroundColor(.primary)
                                }
                            }

                            Spacer()

                            Image(systemName: "chevron.down")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                        )
                    }

                    // Task Selection (only show if project is selected and has tasks)
                    if !selectedProjectId.isEmpty && !timerViewModel.tasks.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Select Task (optional)")
                                .font(.headline)

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
                                        Text("Select a task...")
                                            .foregroundColor(.secondary)
                                    } else {
                                        Text(timerViewModel.getTaskName(for: selectedTaskId))
                                            .foregroundColor(.primary)
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.down")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .padding()
                                .background(Color(NSColor.controlBackgroundColor))
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                                )
                            }
                        }
                    }

                    // Description input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Description (optional)")
                            .font(.headline)

                        TextField("What are you working on?", text: $description)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                    }
                }
            }

            // Control Buttons
            HStack(spacing: 16) {
                if timerViewModel.isRunning {
                    Button(action: {
                        Task {
                            await timerViewModel.stopTimer()
                            // Clear form after stopping
                            selectedProjectId = ""
                            selectedTaskId = ""
                            description = ""
                        }
                    }) {
                        HStack {
                            if timerViewModel.isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }

                            Image(systemName: "stop.fill")
                            Text("Stop Timer")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .disabled(timerViewModel.isLoading)
                } else {
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
                            if timerViewModel.isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }

                            Image(systemName: "play.fill")
                            Text("Start Timer")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .disabled(timerViewModel.isLoading)
                }
            }

            // Error message
            if let errorMessage = timerViewModel.errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            // Projects status
            if timerViewModel.projects.isEmpty && !timerViewModel.isLoading {
                VStack(spacing: 8) {
                    Image(systemName: "folder.badge.questionmark")
                        .font(.title2)
                        .foregroundColor(.orange)

                    Text("No projects available")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    Text("You can still track time without a project")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
            }
        }
        .padding()
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