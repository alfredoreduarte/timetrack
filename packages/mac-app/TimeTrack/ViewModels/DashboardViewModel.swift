import Foundation

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var earnings: DashboardEarnings?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient = APIClient.shared

    // MARK: - Public Methods

    func loadDashboardEarnings() async {
        isLoading = true
        errorMessage = nil

        do {
            // Get user's timezone
            let timezone = TimeZone.current.identifier
            earnings = try await apiClient.getDashboardEarnings(timezone: timezone)
        } catch {
            errorMessage = error.localizedDescription
            print("Error loading dashboard earnings: \(error)")
        }

        isLoading = false
    }

    // MARK: - Computed Properties

    var todayEarningsFormatted: String {
        guard let earnings = earnings else { return "$0.00" }
        return String(format: "$%.2f", earnings.today.earnings)
    }

    var thisWeekEarningsFormatted: String {
        guard let earnings = earnings else { return "$0.00" }
        return String(format: "$%.2f", earnings.thisWeek.earnings)
    }

    var todayDurationFormatted: String {
        guard let earnings = earnings else { return "0h 0m" }
        return formatDuration(earnings.today.duration)
    }

    var thisWeekDurationFormatted: String {
        guard let earnings = earnings else { return "0h 0m" }
        return formatDuration(earnings.thisWeek.duration)
    }

    // MARK: - Helper Methods

    private func formatDuration(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }
}