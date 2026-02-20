import Foundation
import SwiftUI
import Combine
import ActivityKit

@MainActor
class TimerViewModel: ObservableObject {
    @Published var currentEntry: TimeEntry?
    @Published var recentEntries: [TimeEntry] = []
    @Published var projects: [Project] = []
    @Published var tasks: [TimeTrackTask] = []
    @Published var isLoading = false
    @Published var isRefreshing = false
    @Published var errorMessage: String?
    @Published var elapsedTime: Int = 0

    // Selected project and task for starting new timers
    @Published var selectedProjectId: String?
    @Published var selectedTaskId: String?

    private let apiClient = APIClient.shared
    private var timer: Timer?
    private var backgroundTime: Date?
    private var idleTimeoutSeconds: Int
    private var idleTimeoutObserver: NSObjectProtocol?
    private var socketCancellables = Set<AnyCancellable>()

    var isRunning: Bool {
        currentEntry?.isRunning ?? false
    }

    var formattedElapsedTime: String {
        let hours = elapsedTime / 3600
        let minutes = (elapsedTime % 3600) / 60
        let seconds = elapsedTime % 60

        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
        }
    }

    // Live earnings calculation for the current running timer
    var currentTimerLiveEarnings: Double? {
        guard let currentEntry = currentEntry,
              currentEntry.isRunning,
              let rate = currentEntry.hourlyRateSnapshot,
              rate > 0 else {
            return nil
        }

        return rate * Double(elapsedTime) / 3600.0
    }

    init() {
        idleTimeoutSeconds = TimerViewModel.resolveIdleTimeoutSeconds()
        Task {
            await loadInitialData()
        }

        // Set up automatic refresh on app lifecycle changes
        setupAutoRefresh()

        // Set up idle monitoring to automatically stop running timers
        setupIdleMonitoring()
        observeIdleTimeoutChanges()

        // Set up Socket.IO event subscriptions for real-time updates
        setupSocketSubscriptions()

        // Set up fallback polling notifications
        observePollFallback()
    }

    deinit {
        timer?.invalidate()
        timer = nil
        socketCancellables.removeAll()

        // Remove notification observers
        NotificationCenter.default.removeObserver(self)
        if let observer = idleTimeoutObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Data Loading
    func loadInitialData() async {
        print("🔄 Starting full data refresh...")
        isRefreshing = true
        defer { isRefreshing = false }

        print("📊 Loading current entry...")
        await loadCurrentEntry()

        print("📋 Loading recent entries...")
        await loadRecentEntries()

        print("📁 Loading projects...")
        await loadProjects()

        print("✅ Data refresh completed")
    }

    func loadCurrentEntry() async {
        do {
            currentEntry = try await apiClient.getCurrentEntry()

            if let entry = currentEntry, entry.isRunning {
                print("⏱️ Found running timer, starting elapsed time counter")
                calculateElapsedTime(from: entry.startTime)
                startElapsedTimer()

                // Start Live Activity if not already active
                if !LiveActivityManager.shared.hasActiveActivity(for: entry.id) {
                    await LiveActivityManager.shared.startActivity(entry: entry)
                }
            } else {
                print("⏹️ No running timer found")
                stopElapsedTimer()
                elapsedTime = 0

                // End any stale Live Activities
                await LiveActivityManager.shared.endAllActivities()
            }
        } catch {
            print("❌ Error loading current entry: \(error)")
        }
    }

    func loadRecentEntries() async {
        do {
            recentEntries = try await apiClient.getTimeEntries(limit: 10)
            print("📝 Loaded \(recentEntries.count) recent entries")
        } catch {
            print("❌ Error loading recent entries: \(error)")
            // Don't clear existing entries on error, just log it
        }
    }

    func loadProjects() async {
        do {
            projects = try await apiClient.getProjects()
            print("📂 Loaded \(projects.count) projects")
        } catch {
            print("❌ Error loading projects: \(error)")
        }
    }

    func loadTasks(for projectId: String? = nil) async {
        do {
            // Only load non-completed tasks for the dropdown selection
            tasks = try await apiClient.getTasks(projectId: projectId, isCompleted: false)
        } catch {
            print("Error loading tasks: \(error)")
        }
    }

    // Method to handle project selection and automatically load tasks
    func selectProject(_ projectId: String?) async {
        selectedProjectId = projectId
        selectedTaskId = nil // Reset task selection when project changes

        if let projectId = projectId {
            await loadTasks(for: projectId)
        } else {
            tasks = [] // Clear tasks if no project selected
        }
    }

    // MARK: - Timer Operations
    func startTimer(projectId: String?, taskId: String? = nil, description: String? = nil) async {
        isLoading = true
        errorMessage = nil

        do {
            let entry = try await apiClient.startTimer(
                projectId: projectId,
                taskId: taskId,
                description: description
            )

            currentEntry = entry
            calculateElapsedTime(from: entry.startTime)
            startElapsedTimer()

            // Start Live Activity
            await LiveActivityManager.shared.startActivity(entry: entry)

            // Refresh recent entries
            await loadRecentEntries()

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func stopTimer() async {
        guard let entry = currentEntry else { return }

        isLoading = true
        errorMessage = nil

        do {
            let stoppedEntry = try await apiClient.stopTimer(entryId: entry.id)
            currentEntry = stoppedEntry
            stopElapsedTimer()
            elapsedTime = 0

            // Stop Live Activity
            await LiveActivityManager.shared.stopActivity()

            // Refresh recent entries
            await loadRecentEntries()

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func restartTimer(fromEntry entry: TimeEntry) async {
        await startTimer(
            projectId: entry.projectId,
            taskId: entry.taskId,
            description: entry.description
        )
    }

    // MARK: - Elapsed Time Management
    private func calculateElapsedTime(from startTimeString: String) {
        guard let startTime = DateUtils.parseISO8601(startTimeString) else {
            #if DEBUG
            print("Failed to parse start time: \(startTimeString)")
            #endif
            elapsedTime = 0
            return
        }

        let elapsed = Int(Date().timeIntervalSince(startTime))
        elapsedTime = max(0, elapsed)
    }

    private func startElapsedTimer() {
        stopElapsedTimer() // Stop any existing timer

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.elapsedTime += 1
            }
        }
    }

    private func stopElapsedTimer() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Helper Methods
    func getProjectName(for projectId: String?) -> String {
        guard let projectId = projectId,
              let project = projects.first(where: { $0.id == projectId }) else {
            return "No Project"
        }
        return project.name
    }

    func getProjectName(for entry: TimeEntry) -> String {
        // Use populated project data if available, otherwise fall back to lookup
        if let project = entry.project {
            return project.name
        }
        return getProjectName(for: entry.projectId)
    }

    func getProjectColor(for projectId: String?) -> Color {
        guard let projectId = projectId,
              let project = projects.first(where: { $0.id == projectId }),
              let colorString = project.color else {
            return .gray
        }

        // Convert hex color string to Color
        return Color(hex: colorString) ?? .gray
    }

    func getProjectColor(for entry: TimeEntry) -> Color {
        // Use populated project data if available, otherwise fall back to lookup
        if let project = entry.project, let colorString = project.color {
            return Color(hex: colorString) ?? .gray
        }
        return getProjectColor(for: entry.projectId)
    }

    func getTaskName(for taskId: String?) -> String {
        guard let taskId = taskId,
              let task = tasks.first(where: { $0.id == taskId }) else {
            return "No Task"
        }
        return task.name
    }

    func getTaskName(for entry: TimeEntry) -> String {
        // Use populated task data if available, otherwise fall back to lookup
        if let task = entry.task {
            return task.name
        }
        return getTaskName(for: entry.taskId)
    }

    func getTaskFromAllProjects(taskId: String?) async -> String {
        // This method can be used to get task name even if it's not in the current project's tasks
        // Useful for displaying task names in recent entries that might be from different projects
        guard let taskId = taskId else { return "No Task" }

        // First check if it's in the currently loaded tasks
        if let task = tasks.first(where: { $0.id == taskId }) {
            return task.name
        }

        // If not found, try to fetch it from the API
        do {
            let task = try await apiClient.getTask(id: taskId)
            return task.name
        } catch {
            print("Error fetching task: \(error)")
            return "Unknown Task"
        }
    }

    func clearError() {
        errorMessage = nil
    }

    // MARK: - Auto Refresh Setup
    private func setupAutoRefresh() {
        // Listen for app becoming active (iOS lifecycle changes)
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshTimerState()
            }
        }
    }

    private func refreshTimerState() async {
        // Lightweight refresh focused on timer state
        await loadCurrentEntry()
    }

    // MARK: - Idle Monitoring Setup

    private static func resolveIdleTimeoutSeconds() -> Int {
        let stored = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
        return stored > 0 ? stored : AppConstants.defaultIdleTimeoutSeconds
    }

    private func setupIdleMonitoring() {
        // Monitor when app goes to background
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleAppBackgrounded()
            }
        }

        // Monitor when app comes to foreground
        NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.handleAppForegrounded()
            }
        }
    }

    private func observeIdleTimeoutChanges() {
        idleTimeoutObserver = NotificationCenter.default.addObserver(
            forName: .idleTimeoutUpdated,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let seconds = notification.userInfo?["seconds"] as? Int else { return }
            Task { @MainActor in
                self?.idleTimeoutSeconds = seconds
            }
        }
    }

    private func handleAppBackgrounded() {
        if isRunning {
            backgroundTime = Date()
        }
    }

    private func handleAppForegrounded() async {
        guard let backgroundTime = backgroundTime, isRunning else {
            self.backgroundTime = nil
            return
        }

        let timeInBackground = Date().timeIntervalSince(backgroundTime)
        self.backgroundTime = nil

        if timeInBackground >= Double(idleTimeoutSeconds) {
            // Stop the timer due to idle timeout
            await stopTimer()
        } else {
            // Just refresh the timer state
            await loadCurrentEntry()
        }
    }

    // MARK: - Socket.IO Subscriptions

    private func setupSocketSubscriptions() {
        let socketService = SocketService.shared

        // Timer started remotely
        socketService.timerStartedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] entry in
                Task { @MainActor in
                    self?.handleRemoteTimerStarted(entry)
                }
            }
            .store(in: &socketCancellables)

        // Timer stopped remotely
        socketService.timerStoppedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] entry in
                Task { @MainActor in
                    self?.handleRemoteTimerStopped(entry)
                }
            }
            .store(in: &socketCancellables)

        // Entry created remotely
        socketService.entryCreatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] entry in
                Task { @MainActor in
                    self?.handleRemoteEntryCreated(entry)
                }
            }
            .store(in: &socketCancellables)

        // Entry updated remotely
        socketService.entryUpdatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] entry in
                Task { @MainActor in
                    self?.handleRemoteEntryUpdated(entry)
                }
            }
            .store(in: &socketCancellables)

        // Entry deleted remotely
        socketService.entryDeletedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] entryId in
                Task { @MainActor in
                    self?.handleRemoteEntryDeleted(entryId)
                }
            }
            .store(in: &socketCancellables)

        // Project events
        socketService.projectCreatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] project in
                Task { @MainActor in
                    self?.handleRemoteProjectCreated(project)
                }
            }
            .store(in: &socketCancellables)

        socketService.projectUpdatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] project in
                Task { @MainActor in
                    self?.handleRemoteProjectUpdated(project)
                }
            }
            .store(in: &socketCancellables)

        socketService.projectDeletedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] projectId in
                Task { @MainActor in
                    self?.handleRemoteProjectDeleted(projectId)
                }
            }
            .store(in: &socketCancellables)

        // Task events
        socketService.taskCreatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] task in
                Task { @MainActor in
                    self?.handleRemoteTaskCreated(task)
                }
            }
            .store(in: &socketCancellables)

        socketService.taskUpdatedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] task in
                Task { @MainActor in
                    self?.handleRemoteTaskUpdated(task)
                }
            }
            .store(in: &socketCancellables)

        socketService.taskDeletedSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] taskId in
                Task { @MainActor in
                    self?.handleRemoteTaskDeleted(taskId)
                }
            }
            .store(in: &socketCancellables)
    }

    // MARK: - Remote Timer Event Handlers

    private func handleRemoteTimerStarted(_ entry: TimeEntry) {
        print("⏱️ Remote timer started: \(entry.id)")

        // Update current entry if we don't already have it running
        guard currentEntry?.id != entry.id else { return }

        currentEntry = entry
        if entry.isRunning {
            calculateElapsedTime(from: entry.startTime)
            startElapsedTimer()

            // Start Live Activity for remote timer start
            Task {
                await LiveActivityManager.shared.startActivity(entry: entry)
            }
        }
    }

    private func handleRemoteTimerStopped(_ entry: TimeEntry) {
        print("⏹️ Remote timer stopped: \(entry.id)")

        // If the stopped entry is our current running entry
        if currentEntry?.id == entry.id {
            currentEntry = entry
            stopElapsedTimer()
            elapsedTime = 0

            // Stop Live Activity for remote timer stop
            Task {
                await LiveActivityManager.shared.stopActivity()
            }
        }

        // Refresh recent entries list
        Task {
            await loadRecentEntries()
        }
    }

    private func handleRemoteEntryCreated(_ entry: TimeEntry) {
        print("📝 Remote entry created: \(entry.id)")

        // Add to recent entries if not already present
        if !recentEntries.contains(where: { $0.id == entry.id }) {
            recentEntries.insert(entry, at: 0)
            // Keep only recent 10
            if recentEntries.count > 10 {
                recentEntries.removeLast()
            }
        }
    }

    private func handleRemoteEntryUpdated(_ entry: TimeEntry) {
        print("📝 Remote entry updated: \(entry.id)")

        // Update in recent entries list
        if let index = recentEntries.firstIndex(where: { $0.id == entry.id }) {
            recentEntries[index] = entry
        }

        // Update current entry if it matches
        if currentEntry?.id == entry.id {
            let wasRunning = currentEntry?.isRunning ?? false
            currentEntry = entry

            // Handle running state changes
            if entry.isRunning && !wasRunning {
                calculateElapsedTime(from: entry.startTime)
                startElapsedTimer()
            } else if !entry.isRunning && wasRunning {
                stopElapsedTimer()
                elapsedTime = 0
            }
        }
    }

    private func handleRemoteEntryDeleted(_ entryId: String) {
        print("🗑️ Remote entry deleted: \(entryId)")

        // Remove from recent entries
        recentEntries.removeAll { $0.id == entryId }

        // Clear current entry if it was deleted
        if currentEntry?.id == entryId {
            currentEntry = nil
            stopElapsedTimer()
            elapsedTime = 0
        }
    }

    // MARK: - Remote Project Event Handlers

    private func handleRemoteProjectCreated(_ project: Project) {
        print("📁 Remote project created: \(project.id)")

        // Add to projects list if not already present
        if !projects.contains(where: { $0.id == project.id }) {
            projects.append(project)
        }
    }

    private func handleRemoteProjectUpdated(_ project: Project) {
        print("📁 Remote project updated: \(project.id)")

        // Update in projects list
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        }
    }

    private func handleRemoteProjectDeleted(_ projectId: String) {
        print("🗑️ Remote project deleted: \(projectId)")

        // Remove from projects list
        projects.removeAll { $0.id == projectId }

        // Clear selected project if it was deleted
        if selectedProjectId == projectId {
            selectedProjectId = nil
            selectedTaskId = nil
            tasks = []
        }
    }

    // MARK: - Remote Task Event Handlers

    private func handleRemoteTaskCreated(_ task: TimeTrackTask) {
        print("📋 Remote task created: \(task.id)")

        // Add to tasks list if it belongs to the currently selected project
        if let project = task.project, project.id == selectedProjectId {
            if !tasks.contains(where: { $0.id == task.id }) {
                tasks.append(task)
            }
        }
    }

    private func handleRemoteTaskUpdated(_ task: TimeTrackTask) {
        print("📋 Remote task updated: \(task.id)")

        // Update in tasks list
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        }
    }

    private func handleRemoteTaskDeleted(_ taskId: String) {
        print("🗑️ Remote task deleted: \(taskId)")

        // Remove from tasks list
        tasks.removeAll { $0.id == taskId }

        // Clear selected task if it was deleted
        if selectedTaskId == taskId {
            selectedTaskId = nil
        }
    }

    // MARK: - Polling Fallback

    private func observePollFallback() {
        NotificationCenter.default.addObserver(
            forName: .timerStatePollReceived,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            Task { @MainActor in
                if let entry = notification.userInfo?["currentEntry"] as? TimeEntry? {
                    self?.handlePolledTimerState(entry)
                }
            }
        }
    }

    private func handlePolledTimerState(_ entry: TimeEntry?) {
        // Only update if state differs from current
        let currentId = currentEntry?.id
        let currentRunning = currentEntry?.isRunning ?? false
        let newId = entry?.id
        let newRunning = entry?.isRunning ?? false

        // State changed
        if currentId != newId || currentRunning != newRunning {
            currentEntry = entry

            if let entry = entry, entry.isRunning {
                calculateElapsedTime(from: entry.startTime)
                startElapsedTimer()
            } else {
                stopElapsedTimer()
                elapsedTime = 0
            }

            // Also refresh recent entries
            Task {
                await loadRecentEntries()
            }
        }
    }
}

// MARK: - Premium App Theme
struct AppTheme {
    // Core colors - Rich, premium dark palette
    static let primary = Color(hex: "#F8FAFC") ?? .white
    static let secondary = Color(hex: "#94A3B8") ?? .secondary
    static let tertiary = Color(hex: "#64748B") ?? .gray

    // Accent colors - Vibrant gradient-ready
    static let accent = Color(hex: "#6366F1") ?? .blue  // Indigo
    static let accentSecondary = Color(hex: "#8B5CF6") ?? .purple  // Violet

    // Backgrounds - Original dark palette
    static let background = Color(hex: "#161516") ?? .black
    static let backgroundElevated = Color(hex: "#1A1A1A") ?? .black
    static let cardBackground = Color(hex: "#1F1F1F") ?? .gray
    static let cardBackgroundHover = Color(hex: "#2A2A2A") ?? .gray

    // Semantic colors - Rich and bold
    static let success = Color(hex: "#22C55E") ?? .green
    static let successMuted = Color(hex: "#16A34A") ?? .green
    static let error = Color(hex: "#F43F5E") ?? .red  // Rose for premium feel
    static let errorMuted = Color(hex: "#E11D48") ?? .red
    static let warning = Color(hex: "#F59E0B") ?? .orange

    // Earnings highlight - Green for live money display
    static let earnings = Color(hex: "#22C55E") ?? .green
    static let earningsMuted = Color(hex: "#16A34A") ?? .green

    // Border colors
    static let border = Color(hex: "#27272A") ?? .gray
    static let borderSubtle = Color(hex: "#1F1F23") ?? .gray
    static let borderAccent = (Color(hex: "#6366F1") ?? .blue).opacity(0.3)

    // Gradients
    static let accentGradient = LinearGradient(
        colors: [Color(hex: "#6366F1") ?? .blue, Color(hex: "#8B5CF6") ?? .purple],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let successGradient = LinearGradient(
        colors: [Color(hex: "#22C55E") ?? .green, Color(hex: "#10B981") ?? .green],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let errorGradient = LinearGradient(
        colors: [Color(hex: "#F43F5E") ?? .red, Color(hex: "#E11D48") ?? .red],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardGradient = LinearGradient(
        colors: [Color(hex: "#18181B") ?? .gray, Color(hex: "#111113") ?? .black],
        startPoint: .top,
        endPoint: .bottom
    )

    // Typography weights
    static let fontWeightLight: Font.Weight = .light
    static let fontWeightRegular: Font.Weight = .regular
    static let fontWeightMedium: Font.Weight = .medium
    static let fontWeightSemibold: Font.Weight = .semibold
    static let fontWeightBold: Font.Weight = .bold

    // Spacing system
    static let spacingXS: CGFloat = 4
    static let spacingSM: CGFloat = 8
    static let spacingMD: CGFloat = 12
    static let spacingLG: CGFloat = 16
    static let spacingXL: CGFloat = 24
    static let spacing2XL: CGFloat = 32

    // Border radius
    static let radiusSM: CGFloat = 6
    static let radiusMD: CGFloat = 10
    static let radiusLG: CGFloat = 14
    static let radiusXL: CGFloat = 20
    static let radiusFull: CGFloat = 100
}

// Color(hex:) extension is in Extensions/Color+Hex.swift