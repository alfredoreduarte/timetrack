import Foundation

class TimerService: ObservableObject {
    private let apiClient = APIClient.shared

    func getCurrentEntry() async throws -> TimeEntry? {
        return try await apiClient.getCurrentEntry()
    }

    func getTimeEntries(
        projectId: String? = nil,
        isRunning: Bool? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        page: Int? = nil,
        limit: Int = 10
    ) async throws -> [TimeEntry] {
        return try await apiClient.getTimeEntries(
            projectId: projectId,
            isRunning: isRunning,
            startDate: startDate,
            endDate: endDate,
            page: page,
            limit: limit
        )
    }

    func getProjects() async throws -> [Project] {
        return try await apiClient.getProjects()
    }

    func startTimer(projectId: String?, description: String? = nil) async throws -> TimeEntry {
        return try await apiClient.startTimer(projectId: projectId, description: description)
    }

    func stopTimer(entryId: String) async throws -> TimeEntry {
        return try await apiClient.stopTimer(entryId: entryId)
    }
}