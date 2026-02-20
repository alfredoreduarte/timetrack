import Foundation
import ActivityKit
import SwiftUI

@MainActor
class LiveActivityManager: ObservableObject {
    static let shared = LiveActivityManager()

    private var currentActivity: Activity<TimerActivityAttributes>?
    private var updateTimer: Timer?

    private init() {}

    // MARK: - Public Methods

    func startActivity(entry: TimeEntry) async {
        // End any existing activity first
        await stopActivity()

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("⚠️ Live Activities are not enabled")
            return
        }

        // Parse start time
        guard let startDate = parseStartTime(entry.startTime) else {
            print("❌ Failed to parse start time for Live Activity")
            return
        }

        let projectName = entry.project?.name ?? "No Project"
        let projectColor = entry.project?.color ?? "#6366F1"
        let taskName = entry.task?.name
        let hourlyRate = entry.hourlyRateSnapshot

        let attributes = TimerActivityAttributes(
            projectName: projectName,
            projectColor: projectColor,
            taskName: taskName,
            hourlyRate: hourlyRate,
            startTime: startDate,
            entryId: entry.id
        )

        let elapsedSeconds = Int(Date().timeIntervalSince(startDate))
        let initialState = TimerActivityAttributes.ContentState(
            elapsedSeconds: max(0, elapsedSeconds),
            isRunning: true
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: initialState, staleDate: nil),
                pushType: nil
            )
            currentActivity = activity
            print("✅ Started Live Activity: \(activity.id)")

            // Start periodic update timer for earnings refresh
            startUpdateTimer(startDate: startDate)
        } catch {
            print("❌ Failed to start Live Activity: \(error)")
        }
    }

    func stopActivity() async {
        stopUpdateTimer()

        guard let activity = currentActivity else { return }

        let finalState = TimerActivityAttributes.ContentState(
            elapsedSeconds: activity.content.state.elapsedSeconds,
            isRunning: false
        )

        await activity.end(
            ActivityContent(state: finalState, staleDate: nil),
            dismissalPolicy: .immediate
        )

        currentActivity = nil
        print("⏹️ Ended Live Activity")
    }

    func updateActivity(elapsedSeconds: Int) async {
        guard let activity = currentActivity else { return }

        let updatedState = TimerActivityAttributes.ContentState(
            elapsedSeconds: elapsedSeconds,
            isRunning: true
        )

        await activity.update(
            ActivityContent(state: updatedState, staleDate: nil)
        )
    }

    // Check if there's an active Live Activity for a specific entry
    func hasActiveActivity(for entryId: String) -> Bool {
        return Activity<TimerActivityAttributes>.activities.contains { activity in
            activity.attributes.entryId == entryId
        }
    }

    // End all activities (useful for cleanup)
    func endAllActivities() async {
        stopUpdateTimer()

        for activity in Activity<TimerActivityAttributes>.activities {
            let finalState = TimerActivityAttributes.ContentState(
                elapsedSeconds: activity.content.state.elapsedSeconds,
                isRunning: false
            )
            await activity.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
        currentActivity = nil
        print("🧹 Ended all Live Activities")
    }

    // MARK: - Private Methods

    private func startUpdateTimer(startDate: Date) {
        stopUpdateTimer()

        // Update every 60s for earnings refresh only.
        // Elapsed time is rendered by Text(date, style: .timer) in the widget,
        // which the system updates automatically without IPC.
        updateTimer = Timer.scheduledTimer(withTimeInterval: 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                let elapsed = Int(Date().timeIntervalSince(startDate))
                await self?.updateActivity(elapsedSeconds: max(0, elapsed))
            }
        }
    }

    private func stopUpdateTimer() {
        updateTimer?.invalidate()
        updateTimer = nil
    }

    private func parseStartTime(_ startTimeString: String) -> Date? {
        let formatters = [
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'"
        ]

        for format in formatters {
            let formatter = DateFormatter()
            formatter.dateFormat = format
            formatter.timeZone = TimeZone(identifier: "UTC")

            if let date = formatter.date(from: startTimeString) {
                return date
            }
        }

        return nil
    }
}
