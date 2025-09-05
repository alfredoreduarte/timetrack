import Foundation
import SwiftUI

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
        Task {
            await loadInitialData()
        }

        // Set up automatic refresh on app lifecycle changes
        setupAutoRefresh()
    }

    deinit {
        timer?.invalidate()
        timer = nil
        
        // Remove notification observers
        NotificationCenter.default.removeObserver(self)
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
            } else {
                print("⏹️ No running timer found")
                stopElapsedTimer()
                elapsedTime = 0
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
        let formatters = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'"
        ]

        var startTime: Date?

        for format in formatters {
            let formatter = DateFormatter()
            formatter.dateFormat = format
            formatter.timeZone = TimeZone(identifier: "UTC")

            if let date = formatter.date(from: startTimeString) {
                startTime = date
                break
            }
        }

        guard let startTime = startTime else {
            print("❌ Failed to parse start time: \(startTimeString)")
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
}

// MARK: - App Theme
struct AppTheme {
    static let primary = Color(hex: "#FFFFFF") ?? .white
    static let secondary = Color(hex: "#9CA3AF") ?? .secondary
    static let accent = Color(hex: "#3B82F6") ?? .blue
    static let background = Color(hex: "#161516") ?? .black
    static let cardBackground = Color(hex: "#1F1F1F") ?? .gray
    static let success = Color(hex: "#10B981") ?? .green
    static let error = Color(hex: "#EF4444") ?? .red
    static let warning = Color(hex: "#F59E0B") ?? .orange
}

// MARK: - Color Extension
extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}