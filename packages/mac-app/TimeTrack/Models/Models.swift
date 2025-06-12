import Foundation

// MARK: - User Models
struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
    let defaultHourlyRate: Double?
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
    let duration: Int
    let projectId: String?
    let taskId: String?
    let hourlyRateSnapshot: Double?
    let earnings: Double?
    let userId: String
    let createdAt: String?
    let updatedAt: String?

    // Computed properties for UI
    var isRunning: Bool {
        endTime == nil
    }

    var formattedDuration: String {
        let hours = duration / 3600
        let minutes = (duration % 3600) / 60
        let seconds = duration % 60

        if hours > 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%02d:%02d", minutes, seconds)
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

// MARK: - Error Models
struct APIError: Codable {
    let error: String
    let message: String?
}

// MARK: - Generic Response
struct GenericResponse: Codable {
    let message: String
}

// MARK: - Captcha Models
struct CaptchaResponse: Codable {
    let captchaId: String
    let captchaSvg: String
}