import Foundation
import ActivityKit

struct TimerActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var elapsedSeconds: Int
        var isRunning: Bool

        var formattedTime: String {
            let hours = elapsedSeconds / 3600
            let minutes = (elapsedSeconds % 3600) / 60
            let seconds = elapsedSeconds % 60

            if hours > 0 {
                return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
            } else {
                return String(format: "%02d:%02d", minutes, seconds)
            }
        }

        var compactTime: String {
            let hours = elapsedSeconds / 3600
            let minutes = (elapsedSeconds % 3600) / 60
            let seconds = elapsedSeconds % 60

            if hours > 0 {
                return String(format: "%d:%02d", hours, minutes)
            } else {
                return String(format: "%d:%02d", minutes, seconds)
            }
        }
    }

    // Fixed at activity start
    var projectName: String
    var projectColor: String
    var taskName: String?
    var hourlyRate: Double?
    var startTime: Date
    var entryId: String

    func earnings(for elapsedSeconds: Int) -> Double {
        let rate = hourlyRate ?? 0
        return rate * Double(elapsedSeconds) / 3600.0
    }

    func formattedEarnings(for elapsedSeconds: Int) -> String {
        let amount = earnings(for: elapsedSeconds)
        return String(format: "$%.2f", amount)
    }
}
