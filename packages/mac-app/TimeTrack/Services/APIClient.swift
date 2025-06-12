import Foundation

class APIClient: ObservableObject {
    static let shared = APIClient()

    private let baseURL: String
    private let session = URLSession.shared

    // Token storage
    @Published var authToken: String?

    init() {
        // Use environment variable or fallback to production API
        if let apiURL = ProcessInfo.processInfo.environment["TIMETRACK_API_URL"] {
            self.baseURL = apiURL
        } else {
            self.baseURL = "https://api.track.alfredo.re"
        }

        // Load saved token
        self.authToken = UserDefaults.standard.string(forKey: "timetrack_auth_token")
    }

    // MARK: - Token Management
    func saveToken(_ token: String) {
        self.authToken = token
        UserDefaults.standard.set(token, forKey: "timetrack_auth_token")
    }

    func clearToken() {
        self.authToken = nil
        UserDefaults.standard.removeObject(forKey: "timetrack_auth_token")
    }

    // MARK: - Generic Request Method
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

        // Add auth token if available
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = body
        }

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIClientError.invalidResponse
            }

            // Handle different status codes
            switch httpResponse.statusCode {
            case 200...299:
                do {
                    let decodedResponse = try JSONDecoder().decode(responseType, from: data)
                    return decodedResponse
                } catch {
                    print("Decoding error: \(error)")
                    print("Raw response: \(String(data: data, encoding: .utf8) ?? "nil")")
                    throw APIClientError.decodingError(error)
                }
            case 401:
                // Clear invalid token
                clearToken()
                throw APIClientError.unauthorized
            case 400...499:
                // Try to decode error response
                if let errorResponse = try? JSONDecoder().decode(APIError.self, from: data) {
                    throw APIClientError.clientError(errorResponse.error)
                } else {
                    throw APIClientError.clientError("Client error")
                }
            case 500...599:
                throw APIClientError.serverError
            default:
                throw APIClientError.unknownError
            }
        } catch {
            if error is APIClientError {
                throw error
            } else {
                throw APIClientError.networkError(error)
            }
        }
    }

    // MARK: - Auth API
    func login(email: String, password: String) async throws -> AuthResponse {
        let loginRequest = LoginRequest(email: email, password: password)
        let body = try JSONEncoder().encode(loginRequest)

        return try await makeRequest(
            endpoint: "/auth/login",
            method: .POST,
            body: body,
            responseType: AuthResponse.self
        )
    }

    func register(name: String, email: String, password: String, defaultHourlyRate: Double? = nil, captchaId: String? = nil, captchaValue: String? = nil) async throws -> AuthResponse {
        let registerRequest = RegisterRequest(
            email: email,
            password: password,
            name: name,
            defaultHourlyRate: defaultHourlyRate,
            captchaId: captchaId,
            captchaValue: captchaValue
        )
        let body = try JSONEncoder().encode(registerRequest)

        return try await makeRequest(
            endpoint: "/auth/register",
            method: .POST,
            body: body,
            responseType: AuthResponse.self
        )
    }

    func getCurrentUser() async throws -> User {
        struct UserResponse: Codable {
            let user: User
        }

        let response = try await makeRequest(
            endpoint: "/auth/me",
            method: .GET,
            responseType: UserResponse.self
        )
        return response.user
    }

    func getCaptcha() async throws -> CaptchaResponse {
        return try await makeRequest(
            endpoint: "/auth/captcha",
            method: .GET,
            responseType: CaptchaResponse.self
        )
    }

    func refreshToken() async throws -> String {
        struct RefreshResponse: Codable {
            let message: String
            let token: String
        }

        let response = try await makeRequest(
            endpoint: "/auth/refresh",
            method: .POST,
            responseType: RefreshResponse.self
        )

        // Save the new token
        saveToken(response.token)
        return response.token
    }

    // MARK: - Projects API
    func getProjects() async throws -> [Project] {
        let response = try await makeRequest(
            endpoint: "/projects",
            method: .GET,
            responseType: ProjectsResponse.self
        )
        return response.projects
    }

    // MARK: - Tasks API
    func getTasks(projectId: String? = nil, isCompleted: Bool? = nil) async throws -> [TimeTrackTask] {
        var queryItems: [URLQueryItem] = []

        if let projectId = projectId {
            queryItems.append(URLQueryItem(name: "projectId", value: projectId))
        }

        if let isCompleted = isCompleted {
            queryItems.append(URLQueryItem(name: "isCompleted", value: String(isCompleted)))
        }

        var endpoint = "/tasks"
        if !queryItems.isEmpty {
            var components = URLComponents()
            components.queryItems = queryItems
            if let queryString = components.percentEncodedQuery {
                endpoint += "?" + queryString
            }
        }

        let response = try await makeRequest(
            endpoint: endpoint,
            method: .GET,
            responseType: TasksResponse.self
        )
        return response.tasks
    }

    func getTask(id: String) async throws -> TimeTrackTask {
        let response = try await makeRequest(
            endpoint: "/tasks/\(id)",
            method: .GET,
            responseType: TaskResponse.self
        )
        return response.task
    }

    func createTask(name: String, description: String? = nil, projectId: String, hourlyRate: Double? = nil) async throws -> TimeTrackTask {
        let createRequest = CreateTaskRequest(
            name: name,
            description: description,
            projectId: projectId,
            hourlyRate: hourlyRate
        )
        let body = try JSONEncoder().encode(createRequest)

        let response = try await makeRequest(
            endpoint: "/tasks",
            method: .POST,
            body: body,
            responseType: TaskResponse.self
        )
        return response.task
    }

    func updateTask(id: String, name: String? = nil, description: String? = nil, isCompleted: Bool? = nil, hourlyRate: Double? = nil) async throws -> TimeTrackTask {
        let updateRequest = UpdateTaskRequest(
            name: name,
            description: description,
            isCompleted: isCompleted,
            hourlyRate: hourlyRate
        )
        let body = try JSONEncoder().encode(updateRequest)

        let response = try await makeRequest(
            endpoint: "/tasks/\(id)",
            method: .PUT,
            body: body,
            responseType: TaskResponse.self
        )
        return response.task
    }

    func deleteTask(id: String) async throws {
        struct DeleteResponse: Codable {
            let message: String
        }

        _ = try await makeRequest(
            endpoint: "/tasks/\(id)",
            method: .DELETE,
            responseType: DeleteResponse.self
        )
    }

    // MARK: - Time Entries API
    func getCurrentEntry() async throws -> TimeEntry? {
        // Handle the special case where the API returns null for no running entry
        do {
            let response = try await makeRequest(
                endpoint: "/time-entries/current",
                method: .GET,
                responseType: CurrentTimeEntryResponse.self
            )
            return response.timeEntry
        } catch APIClientError.decodingError {
            // If decoding fails, it might be because the response is null (no running entry)
            return nil
        }
    }

    func getTimeEntries(
        projectId: String? = nil,
        isRunning: Bool? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        page: Int? = nil,
        limit: Int = 50
    ) async throws -> [TimeEntry] {
        var queryItems: [URLQueryItem] = []

        if let projectId = projectId {
            queryItems.append(URLQueryItem(name: "projectId", value: projectId))
        }

        if let isRunning = isRunning {
            queryItems.append(URLQueryItem(name: "isRunning", value: String(isRunning)))
        }

        if let startDate = startDate {
            queryItems.append(URLQueryItem(name: "startDate", value: startDate))
        }

        if let endDate = endDate {
            queryItems.append(URLQueryItem(name: "endDate", value: endDate))
        }

        if let page = page {
            queryItems.append(URLQueryItem(name: "page", value: String(page)))
        }

        queryItems.append(URLQueryItem(name: "limit", value: String(limit)))

        var endpoint = "/time-entries"
        if !queryItems.isEmpty {
            var components = URLComponents()
            components.queryItems = queryItems
            if let queryString = components.percentEncodedQuery {
                endpoint += "?" + queryString
            }
        }

        let response = try await makeRequest(
            endpoint: endpoint,
            method: .GET,
            responseType: TimeEntriesResponse.self
        )
        return response.entries
    }

    func startTimer(projectId: String?, taskId: String? = nil, description: String? = nil) async throws -> TimeEntry {
        let startRequest = StartTimerRequest(
            projectId: projectId,
            taskId: taskId,
            description: description
        )
        let body = try JSONEncoder().encode(startRequest)

        let response = try await makeRequest(
            endpoint: "/time-entries/start",
            method: .POST,
            body: body,
            responseType: TimerResponse.self
        )
        return response.timeEntry
    }

    func stopTimer(entryId: String) async throws -> TimeEntry {
        let response = try await makeRequest(
            endpoint: "/time-entries/\(entryId)/stop",
            method: .POST,
            responseType: TimerResponse.self
        )
        return response.timeEntry
    }
}

// MARK: - HTTP Methods
enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
}

// MARK: - API Errors
enum APIClientError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case clientError(String)
    case serverError
    case networkError(Error)
    case decodingError(Error)
    case unknownError

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .unauthorized:
            return "Unauthorized - please log in again"
        case .clientError(let message):
            return message
        case .serverError:
            return "Server error - please try again later"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Data parsing error: \(error.localizedDescription)"
        case .unknownError:
            return "Unknown error occurred"
        }
    }
}