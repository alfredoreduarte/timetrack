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

    func register(name: String, email: String, password: String, captchaId: String? = nil, captchaValue: String? = nil) async throws -> AuthResponse {
        let registerRequest = RegisterRequest(
            email: email,
            password: password,
            name: name,
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

    // MARK: - Projects API
    func getProjects() async throws -> [Project] {
        let response = try await makeRequest(
            endpoint: "/projects",
            method: .GET,
            responseType: ProjectsResponse.self
        )
        return response.projects
    }

    // MARK: - Time Entries API
    func getCurrentEntry() async throws -> TimeEntry? {
        return try await makeRequest(
            endpoint: "/time-entries/current",
            method: .GET,
            responseType: TimeEntry?.self
        )
    }

    func getTimeEntries(limit: Int = 10) async throws -> [TimeEntry] {
        let response = try await makeRequest(
            endpoint: "/time-entries?limit=\(limit)",
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