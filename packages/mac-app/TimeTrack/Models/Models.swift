import Foundation

enum AppConstants {
    static let idleTimeoutSecondsKey = "timetrack_idle_timeout_seconds"
    static let defaultIdleTimeoutSeconds = 600
}

extension Notification.Name {
    static let idleTimeoutUpdated = Notification.Name("IdleTimeoutUpdated")
    static let userDidLogout = Notification.Name("UserDidLogout")
    static let userDidLogin = Notification.Name("UserDidLogin")
    static let timerStatePollReceived = Notification.Name("timerStatePollReceived")
}

// MARK: - User Models
struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
    let defaultHourlyRate: Double?
    let idleTimeoutSeconds: Int?
    let createdAt: String?
    let updatedAt: String?
}

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct RegisterRequest: Codable {
    let email: String
    let password: String
    let name: String
    let defaultHourlyRate: Double?
    let captchaId: String?
    let captchaValue: String?
}

struct AuthResponse: Codable {
    let message: String?
    let user: User
    let token: String
}

// MARK: - Project Models
struct Project: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let color: String?
    let hourlyRate: Double?
    let isActive: Bool
    let createdAt: String?
    let updatedAt: String?
}

struct ProjectsResponse: Codable {
    let projects: [Project]
}

// MARK: - Task Models
struct TimeTrackTask: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let isCompleted: Bool
    let hourlyRate: Double?
    let createdAt: String?
    let updatedAt: String?
    let project: TaskProject?
    let _count: TaskCount?

    struct TaskProject: Codable {
        let id: String
        let name: String
        let color: String?
    }

    struct TaskCount: Codable {
        let timeEntries: Int
    }
}

struct TasksResponse: Codable {
    let tasks: [TimeTrackTask]
}

struct CreateTaskRequest: Codable {
    let name: String
    let description: String?
    let projectId: String
    let hourlyRate: Double?
}

struct UpdateTaskRequest: Codable {
    let name: String?
    let description: String?
    let isCompleted: Bool?
    let hourlyRate: Double?
}

struct TaskResponse: Codable {
    let message: String
    let task: TimeTrackTask
}

// MARK: - Time Entry Models
struct TimeEntry: Codable, Identifiable {
    let id: String
    let description: String?
    let startTime: String
    let endTime: String?
    let duration: Int?
    let isRunning: Bool
    let hourlyRateSnapshot: Double?
    let projectId: String?
    let taskId: String?
    let userId: String?
    let createdAt: String?
    let updatedAt: String?
    let project: TimeEntryProject?
    let task: TimeEntryTask?

    struct TimeEntryProject: Codable {
        let id: String
        let name: String
        let color: String?
    }

    struct TimeEntryTask: Codable {
        let id: String
        let name: String
    }

    // Safe access to duration with fallback
    var safeDuration: Int {
        if let duration = duration {
            return duration
        }

        // For running timers, calculate elapsed time from startTime to now
        if isRunning {
            return calculateElapsedTime()
        }

        return 0
    }

    // Calculate elapsed time for running timers
    private func calculateElapsedTime() -> Int {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Try multiple date formats for robust parsing
        let formatters = [
            formatter,
            {
                let f = ISO8601DateFormatter()
                f.formatOptions = [.withInternetDateTime]
                return f
            }(),
            {
                let f = DateFormatter()
                f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
                f.timeZone = TimeZone(identifier: "UTC")
                return f
            }(),
            {
                let f = DateFormatter()
                f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
                f.timeZone = TimeZone(identifier: "UTC")
                return f
            }()
        ]

        for formatter in formatters {
            if let startDate = (formatter as? ISO8601DateFormatter)?.date(from: startTime) ??
                              (formatter as? DateFormatter)?.date(from: startTime) {
                let elapsed = Date().timeIntervalSince(startDate)
                return max(0, Int(elapsed))
            }
        }

        return 0
    }

    var formattedDuration: String {
        let durationValue = safeDuration
        let hours = durationValue / 3600
        let minutes = (durationValue % 3600) / 60
        let seconds = durationValue % 60

        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
        }
    }

    var formattedDurationShort: String {
        let durationValue = safeDuration
        let hours = durationValue / 3600
        let minutes = (durationValue % 3600) / 60
        let seconds = durationValue % 60

        // Show seconds for entries under 1 minute
        if hours == 0 && minutes == 0 {
            if seconds == 0 {
                return "0s"
            } else {
                return "\(seconds)s"
            }
        }

        // Show minutes and hours in MM:SS or HH:MM format
        if hours == 0 {
            return String(format: "%d:%02d", minutes, seconds)
        } else {
            return String(format: "%d:%02d", hours, minutes)
        }
    }

    var formattedStartTime: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        formatter.timeZone = TimeZone(identifier: "UTC")

        if let date = formatter.date(from: startTime) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .short
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }
        return startTime
    }
}

struct TimeEntriesResponse: Codable {
    let entries: [TimeEntry]
    let pagination: Pagination?
}

struct Pagination: Codable {
    let page: Int
    let limit: Int
    let total: Int
    let pages: Int
}

struct StartTimerRequest: Codable {
    let projectId: String?
    let taskId: String?
    let description: String?
}

struct TimerResponse: Codable {
    let message: String
    let timeEntry: TimeEntry
}

struct CurrentTimeEntryResponse: Codable {
    let timeEntry: TimeEntry
}

// MARK: - Error Models
struct APIError: Codable {
    let error: String
    let message: String?
}

// MARK: - Captcha Models
struct CaptchaResponse: Codable {
    let captchaId: String
    let captchaSvg: String
}

// MARK: - Dashboard Earnings Models
struct DashboardEarnings: Codable {
    let currentTimer: CurrentTimerEarnings
    let today: PeriodEarnings
    let thisWeek: PeriodEarnings
}

struct CurrentTimerEarnings: Codable {
    let earnings: Double
    let duration: Int
    let isRunning: Bool
    let hourlyRate: Double
}

struct PeriodEarnings: Codable {
    let earnings: Double
    let duration: Int
}

struct DashboardEarningsResponse: Codable {
    let earnings: DashboardEarnings
}
