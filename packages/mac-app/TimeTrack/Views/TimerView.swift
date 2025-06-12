import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var selectedProjectId: String = ""
    @State private var selectedTaskId: String = ""
    @State private var description: String = ""

    var body: some View {
        VStack(spacing: 16) {
            // Timer Display or Form
            if timerViewModel.isRunning, let entry = timerViewModel.currentEntry {
                // Active timer view
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(entry.description ?? "No description")
                                .font(.headline)
                                .lineLimit(1)

                            Spacer()
                        }

                        HStack(spacing: 6) {
                            // Project indicator
                            if let project = entry.project {
                                Circle()
                                    .fill(Color(hex: project.color ?? "#6366F1") ?? .gray)
                                    .frame(width: 8, height: 8)
                                Text(project.name)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }

                            // Task name if available
                            if let task = entry.task {
                                Text("•")
                                    .foregroundColor(.secondary)
                                Text(task.name)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()
                        }
                    }

                    Spacer()

                    // Timer and earnings stacked vertically
                    VStack(alignment: .center, spacing: 4) {
                        Text(timerViewModel.formattedElapsedTime)
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundColor(.red)
                        if let rate = entry.hourlyRateSnapshot, rate > 0 {
                            let earned = rate * Double(timerViewModel.elapsedTime) / 3600.0
                            Text(String(format: "$%.2f", earned))
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.green)
                        }
                    }
                    .frame(minWidth: 90)
                    .padding(.trailing, 8)

                    // Stop button
                    Button(action: {
                        Task {
                            await timerViewModel.stopTimer()
                            selectedProjectId = ""
                            selectedTaskId = ""
                            description = ""
                        }
                    }) {
                        Image(systemName: "stop.circle.fill")
                            .font(.title)
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.plain)
                    .disabled(timerViewModel.isLoading)
                }
                .padding()
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(8)
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