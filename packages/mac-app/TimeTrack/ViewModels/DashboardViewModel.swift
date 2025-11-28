import Foundation

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var earnings: DashboardEarnings?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient = APIClient.shared

    init() {
        observeAuthChanges()
    }

    private func observeAuthChanges() {
        NotificationCenter.default.addObserver(
            forName: .userDidLogout,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.clearAllData()
            }
        }

        NotificationCenter.default.addObserver(
            forName: .userDidLogin,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.loadDashboardEarnings()
            }
        }
    }

    func clearAllData() {
        earnings = nil
        errorMessage = nil
    }

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

    // Calculate today's total earnings including live running timer
    func calculateTodayTotalEarnings(currentTimerEarnings: Double?) -> Double {
        guard let earnings = earnings else { return 0.0 }
        let baseEarnings = earnings.today.earnings
        let liveEarnings = currentTimerEarnings ?? 0.0
        return baseEarnings + liveEarnings
    }

    // Format today's total earnings as currency string
    func todayEarningsWithLive(currentTimerEarnings: Double?) -> String {
        let total = calculateTodayTotalEarnings(currentTimerEarnings: currentTimerEarnings)
        return String(format: "$%.2f", total)
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