import Foundation

// MARK: - API Client for Watch
class WatchAPIClient: ObservableObject {
    static let shared = WatchAPIClient()
    
    private let baseURL: String
    private let session = URLSession.shared
    
    init() {
        self.baseURL = "https://api.track.alfredo.re"
    }
    
    private var authToken: String? {
        // Test App Groups connectivity
        if let sharedDefaults = UserDefaults(suiteName: "group.com.timetrack.shared") {
            print("📋 Watch: Successfully accessed shared UserDefaults")
            
            // Force synchronize to get latest data
            sharedDefaults.synchronize()
            print("📋 Watch: Synchronized shared UserDefaults")
            
            // Wait a moment for sync
            Thread.sleep(forTimeInterval: 0.1)
            
            // Test if we can read the test value
            if let testValue = sharedDefaults.string(forKey: "test-key") {
                print("📋 Watch: Found test value in shared storage: \(testValue)")
            } else {
                print("❌ Watch: No test value found in shared storage")
                
                // List all keys in shared UserDefaults for debugging
                let allKeys = sharedDefaults.dictionaryRepresentation().keys
                print("📋 Watch: All keys in shared UserDefaults: \(Array(allKeys))")
            }
            
            // Try to get the auth token
            if let token = sharedDefaults.string(forKey: "timetrack_auth_token") {
                print("🔑 Watch: Found token in shared UserDefaults: \(token.prefix(20))...")
                return token
            } else {
                print("❌ Watch: No auth token found in shared UserDefaults")
            }
        } else {
            print("❌ Watch: Failed to access shared UserDefaults")
        }
        
        // Fallback to local UserDefaults
        let localToken = UserDefaults.standard.string(forKey: "timetrack_auth_token")
        if let token = localToken {
            print("🔑 Watch: Found token in local UserDefaults: \(token.prefix(20))...")
        } else {
            print("❌ Watch: No token found in local UserDefaults either")
        }
        return localToken
    }
    
    func hasAuthToken() -> Bool {
        return authToken != nil && !authToken!.isEmpty
    }
    
    private func makeRequest<T: Codable>(
        endpoint: String,
        method: HTTPMethod = .GET,
        body: Data? = nil,
        responseType: T.Type
    ) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIClientError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthorized
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            if let errorResponse = try? JSONDecoder().decode(APIError.self, from: data) {
                throw APIClientError.serverError(errorResponse.error, errorResponse.message)
            }
            throw APIClientError.httpError(httpResponse.statusCode)
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode(responseType, from: data)
    }
    
    // MARK: - API Methods
    func fetchProjects() async throws -> [WatchProject] {
        let response = try await makeRequest(
            endpoint: "/api/projects",
            responseType: ProjectsResponse.self
        )
        return response.projects.map { project in
            WatchProject(
                id: project.id,
                name: project.name,
                color: project.color ?? "#3B82F6"
            )
        }
    }
    
    func fetchRecentEntries() async throws -> [WatchTimeEntry] {
        let response = try await makeRequest(
            endpoint: "/api/time-entries?limit=10",
            responseType: TimeEntriesResponse.self
        )
        return response.entries.map { entry in
            WatchTimeEntry(
                id: entry.id,
                projectName: entry.project?.name ?? "Unknown Project",
                taskName: entry.task?.name,
                duration: TimeInterval(entry.safeDuration),
                hourlyRate: entry.hourlyRateSnapshot ?? 0.0,
                date: parseDate(entry.startTime)
            )
        }
    }
    
    func fetchDashboardEarnings() async throws -> WatchDashboardData {
        let response = try await makeRequest(
            endpoint: "/api/dashboard/earnings",
            responseType: DashboardEarningsResponse.self
        )
        return WatchDashboardData(
            currentEarnings: response.earnings.currentTimer.earnings,
            isTimerRunning: response.earnings.currentTimer.isRunning,
            todaysHours: Double(response.earnings.today.duration) / 3600.0
        )
    }
    
    func getCurrentTimeEntry() async throws -> WatchTimeEntry? {
        do {
            let response = try await makeRequest(
                endpoint: "/api/time-entries/current",
                responseType: CurrentTimeEntryResponse.self
            )
            let entry = response.timeEntry
            return WatchTimeEntry(
                id: entry.id,
                projectName: entry.project?.name ?? "Unknown Project",
                taskName: entry.task?.name,
                duration: TimeInterval(entry.safeDuration),
                hourlyRate: entry.hourlyRateSnapshot ?? 0.0,
                date: parseDate(entry.startTime)
            )
        } catch APIClientError.httpError(404) {
            return nil
        }
    }
    
    func startTimer(projectId: String) async throws {
        let request = StartTimerRequest(projectId: projectId, taskId: nil, description: nil)
        let body = try JSONEncoder().encode(request)
        _ = try await makeRequest(
            endpoint: "/api/time-entries/start",
            method: .POST,
            body: body,
            responseType: TimerResponse.self
        )
    }
    
    func stopTimer() async throws {
        _ = try await makeRequest(
            endpoint: "/api/time-entries/stop",
            method: .POST,
            responseType: TimerResponse.self
        )
    }
    
    private func parseDate(_ dateString: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        if let date = formatter.date(from: dateString) {
            return date
        }
        
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: dateString) ?? Date()
    }
}

// MARK: - Watch Models
struct WatchProject: Identifiable, Codable {
    let id: String
    let name: String
    let color: String
    
    var swiftUIColor: Color {
        Color(hex: color) ?? .blue
    }
}

struct WatchTimeEntry: Identifiable, Codable {
    let id: String
    let projectName: String
    let taskName: String?
    let duration: TimeInterval
    let hourlyRate: Double
    let date: Date
    
    var earnings: Double {
        return (duration / 3600) * hourlyRate
    }
    
    var formattedDuration: String {
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }
}

struct WatchDashboardData {
    let currentEarnings: Double
    let isTimerRunning: Bool
    let todaysHours: Double
}

// MARK: - Supporting Types
enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
}

enum APIClientError: Error {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(String, String?)
    case httpError(Int)
    case clientError(String)
}

// Import existing models from main app
struct ProjectsResponse: Codable {
    let projects: [Project]
}

struct Project: Codable {
    let id: String
    let name: String
    let description: String?
    let color: String?
    let hourlyRate: Double?
    let isActive: Bool
}

struct TimeEntriesResponse: Codable {
    let entries: [TimeEntry]
}

struct TimeEntry: Codable {
    let id: String
    let description: String?
    let startTime: String
    let endTime: String?
    let duration: Int?
    let isRunning: Bool
    let hourlyRateSnapshot: Double?
    let projectId: String?
    let taskId: String?
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
    
    var safeDuration: Int {
        if let duration = duration {
            return duration
        }
        
        if isRunning {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            if let startDate = formatter.date(from: startTime) {
                let elapsed = Date().timeIntervalSince(startDate)
                return max(0, Int(elapsed))
            }
        }
        
        return 0
    }
}

struct DashboardEarningsResponse: Codable {
    let earnings: DashboardEarnings
}

struct DashboardEarnings: Codable {
    let currentTimer: CurrentTimerEarnings
    let today: PeriodEarnings
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

struct APIError: Codable {
    let error: String
    let message: String?
}

// MARK: - Color Extension
import SwiftUI

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