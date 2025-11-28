import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var selectedProjectId: String = ""
    @State private var selectedTaskId: String = ""
    @State private var description: String = ""

    let onRefresh: () -> Void
    let rotationDegrees: Double
    let isRefreshing: Bool

    init(onRefresh: @escaping () -> Void = {}, rotationDegrees: Double = 0.0, isRefreshing: Bool = false) {
        self.onRefresh = onRefresh
        self.rotationDegrees = rotationDegrees
        self.isRefreshing = isRefreshing
    }

    var body: some View {
        VStack(spacing: AppTheme.spacingLG) {
            if timerViewModel.isRunning, let entry = timerViewModel.currentEntry {
                activeTimerView(entry: entry)
            } else {
                idleTimerView
            }

            // Error message
            if let errorMessage = timerViewModel.errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.error)
                    .multilineTextAlignment(.center)
            }
        }
        .onAppear {
            if selectedProjectId.isEmpty, let firstProject = timerViewModel.projects.first(where: { $0.isActive }) {
                selectedProjectId = firstProject.id
                Task {
                    await timerViewModel.selectProject(firstProject.id)
                }
            }
        }
    }

    // MARK: - Active Timer View
    private func activeTimerView(entry: TimeEntry) -> some View {
        VStack(spacing: AppTheme.spacingXL) {
            // Header with project/task and action buttons
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                    Text(entry.project?.name ?? "No Project")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(AppTheme.primary)
                        .lineLimit(1)

                    Text(entry.task?.name ?? "No Task")
                        .font(.system(size: 15))
                        .foregroundColor(AppTheme.secondary)
                        .lineLimit(1)
                }

                Spacer()

                // Refresh button
                Button(action: onRefresh) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16))
                        .foregroundColor(AppTheme.secondary)
                        .rotationEffect(.degrees(rotationDegrees))
                }
                .buttonStyle(.plain)
                .disabled(isRefreshing)
            }

            // Timer display and stop button
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                    // Large timer display
                    Text(timerViewModel.formattedElapsedTime)
                        .font(.system(size: 42, weight: .bold, design: .monospaced))
                        .foregroundColor(AppTheme.primary)

                    // Earnings display
                    if let rate = entry.hourlyRateSnapshot, rate > 0 {
                        let earned = rate * Double(timerViewModel.elapsedTime) / 3600.0
                        Text(String(format: "$%.2f", earned))
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(AppTheme.success)
                    }
                }

                Spacer()

                // Stop button - simple red circle
                Button(action: {
                    Task {
                        await timerViewModel.stopTimer()
                        selectedProjectId = ""
                        selectedTaskId = ""
                        description = ""
                    }
                }) {
                    ZStack {
                        Circle()
                            .fill(AppTheme.error)
                            .frame(width: 60, height: 60)

                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white)
                            .frame(width: 18, height: 18)
                    }
                }
                .buttonStyle(.plain)
                .disabled(timerViewModel.isLoading)
            }
        }
    }

    // MARK: - Idle Timer View
    private var idleTimerView: some View {
        HStack(spacing: AppTheme.spacingLG) {
            // Form fields
            VStack(spacing: AppTheme.spacingMD) {
                // Project picker (highest zIndex so dropdown floats above everything)
                CustomDropdown(
                    placeholder: "Select project",
                    selectedId: $selectedProjectId,
                    items: timerViewModel.projects.filter { $0.isActive }.map { project in
                        DropdownItem(
                            id: project.id,
                            label: project.name,
                            color: timerViewModel.getProjectColor(for: project.id)
                        )
                    },
                    onSelect: { projectId in
                        selectedTaskId = ""
                        Task {
                            await timerViewModel.selectProject(projectId.isEmpty ? nil : projectId)
                        }
                    }
                )
                .zIndex(3)

                // Task picker (middle zIndex)
                CustomDropdown(
                    placeholder: "Select task",
                    selectedId: $selectedTaskId,
                    items: timerViewModel.tasks.map { task in
                        DropdownItem(id: task.id, label: task.name, color: nil)
                    },
                    disabled: selectedProjectId.isEmpty || timerViewModel.tasks.isEmpty
                )
                .zIndex(2)

                // Description input (lowest zIndex)
                ZStack(alignment: .leading) {
                    if description.isEmpty {
                        Text("What are you working on?")
                            .font(.system(size: 14, weight: .medium).italic())
                            .foregroundColor(AppTheme.tertiary)
                            .padding(.horizontal, AppTheme.spacingMD)
                    }
                    TextField("", text: $description)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.primary)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, AppTheme.spacingMD)
                        .padding(.vertical, 10)
                }
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
                .zIndex(1)
            }

            // Play button - simple green circle
            Button(action: {
                Task {
                    await timerViewModel.startTimer(
                        projectId: selectedProjectId.isEmpty ? nil : selectedProjectId,
                        taskId: selectedTaskId.isEmpty ? nil : selectedTaskId,
                        description: description.isEmpty ? nil : description
                    )
                }
            }) {
                ZStack {
                    Circle()
                        .fill(selectedProjectId.isEmpty ? AppTheme.border : AppTheme.success)
                        .frame(width: 60, height: 60)

                    Image(systemName: "play.fill")
                        .font(.system(size: 22))
                        .foregroundColor(selectedProjectId.isEmpty ? AppTheme.secondary : .white)
                        .offset(x: 2)
                }
            }
            .buttonStyle(.plain)
            .disabled(selectedProjectId.isEmpty)
        }
    }
}

// MARK: - Custom Dropdown Components

struct DropdownItem: Identifiable {
    let id: String
    let label: String
    let color: Color?
}

struct CustomDropdown: View {
    let placeholder: String
    @Binding var selectedId: String
    let items: [DropdownItem]
    var onSelect: ((String) -> Void)? = nil
    var disabled: Bool = false

    @State private var isExpanded = false
    @State private var isHovered = false

    private var selectedItem: DropdownItem? {
        items.first { $0.id == selectedId }
    }

    var body: some View {
        // Trigger button
        Button(action: {
            if !disabled {
                withAnimation(.easeOut(duration: 0.15)) {
                    isExpanded.toggle()
                }
            }
        }) {
            HStack(spacing: AppTheme.spacingSM) {
                if let item = selectedItem, let color = item.color {
                    Circle()
                        .fill(color)
                        .frame(width: 8, height: 8)
                }

                Text(selectedItem?.label ?? placeholder)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(selectedItem != nil ? AppTheme.primary : AppTheme.tertiary)
                    .lineLimit(1)

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppTheme.tertiary)
                    .rotationEffect(.degrees(isExpanded ? -180 : 0))
            }
            .padding(.horizontal, AppTheme.spacingMD)
            .padding(.vertical, 10)
            .background(isHovered && !disabled ? AppTheme.cardBackgroundHover : AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                    .stroke(isExpanded ? AppTheme.accent.opacity(0.5) : AppTheme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1.0)
        .onHover { hovering in
            isHovered = hovering
        }
        .overlay(alignment: .topLeading) {
            // Floating dropdown list
            if isExpanded {
                VStack(alignment: .leading, spacing: 2) {
                    // Clear option
                    DropdownRow(
                        label: "None",
                        color: nil,
                        isSelected: selectedId.isEmpty
                    ) {
                        selectedId = ""
                        onSelect?("")
                        withAnimation(.easeOut(duration: 0.15)) {
                            isExpanded = false
                        }
                    }

                    if !items.isEmpty {
                        Divider()
                            .background(AppTheme.border)
                            .padding(.vertical, 4)
                    }

                    ForEach(items) { item in
                        DropdownRow(
                            label: item.label,
                            color: item.color,
                            isSelected: item.id == selectedId
                        ) {
                            selectedId = item.id
                            onSelect?(item.id)
                            withAnimation(.easeOut(duration: 0.15)) {
                                isExpanded = false
                            }
                        }
                    }
                }
                .padding(AppTheme.spacingSM)
                .frame(minWidth: 200)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.4), radius: 12, x: 0, y: 4)
                .offset(y: 44)
                .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
                .zIndex(100)
            }
        }
    }
}

struct DropdownRow: View {
    let label: String
    let color: Color?
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppTheme.spacingSM) {
                if let color = color {
                    Circle()
                        .fill(color)
                        .frame(width: 8, height: 8)
                }

                Text(label)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(AppTheme.primary)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(AppTheme.success)
                }
            }
            .padding(.horizontal, AppTheme.spacingSM)
            .padding(.vertical, 6)
            .background(isHovered ? AppTheme.cardBackgroundHover : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

#Preview {
    VStack {
        TimerView()
            .environmentObject(TimerViewModel())
            .padding()
    }
    .frame(width: 400)
    .background(AppTheme.background)
    .preferredColorScheme(.dark)
}
