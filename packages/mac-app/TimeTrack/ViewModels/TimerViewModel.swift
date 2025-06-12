import Foundation
import SwiftUI

@MainActor
class TimerViewModel: ObservableObject {
    @Published var currentEntry: TimeEntry?
    @Published var recentEntries: [TimeEntry] = []
    @Published var projects: [Project] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var elapsedTime: Int = 0

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

    init() {
        Task {
            await loadInitialData()
        }
    }

    deinit {
        // Safely cleanup timer from non-isolated context
        Task { @MainActor in
            self.stopElapsedTimer()
        }
    }

    // MARK: - Data Loading
    func loadInitialData() async {
        await loadCurrentEntry()
        await loadRecentEntries()
        await loadProjects()
    }

    func loadCurrentEntry() async {
        do {
            currentEntry = try await apiClient.getCurrentEntry()

            if let entry = currentEntry, entry.isRunning {
                calculateElapsedTime(from: entry.startTime)
                startElapsedTimer()
            } else {
                stopElapsedTimer()
                elapsedTime = 0
            }
        } catch {
            print("Error loading current entry: \(error)")
        }
    }

    func loadRecentEntries() async {
        do {
            recentEntries = try await apiClient.getTimeEntries(limit: 10)
        } catch {
            print("Error loading recent entries: \(error)")
        }
    }

    func loadProjects() async {
        do {
            projects = try await apiClient.getProjects()
        } catch {
            print("Error loading projects: \(error)")
        }
    }

    // MARK: - Timer Operations
    func startTimer(projectId: String?, description: String? = nil) async {
        isLoading = true
        errorMessage = nil

        do {
            let entry = try await apiClient.startTimer(
                projectId: projectId,
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
            description: entry.description
        )
    }

    // MARK: - Elapsed Time Management
    private func calculateElapsedTime(from startTimeString: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        formatter.timeZone = TimeZone(identifier: "UTC")

        guard let startTime = formatter.date(from: startTimeString) else {
            elapsedTime = 0
            return
        }

        let elapsed = Int(Date().timeIntervalSince(startTime))
        elapsedTime = max(0, elapsed)
    }

    private func startElapsedTimer() {
        stopElapsedTimer() // Stop any existing timer

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            Task { @MainActor in
                self.elapsedTime += 1
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

    func getProjectColor(for projectId: String?) -> Color {
        guard let projectId = projectId,
              let project = projects.first(where: { $0.id == projectId }),
              let colorString = project.color else {
            return .gray
        }

        // Convert hex color string to Color
        return Color(hex: colorString) ?? .gray
    }

    func clearError() {
        errorMessage = nil
    }
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