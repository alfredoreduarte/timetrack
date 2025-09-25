import Foundation

class AuthService: ObservableObject {
    private let apiClient = APIClient.shared

    func login(email: String, password: String) async throws -> AuthResponse {
        return try await apiClient.login(email: email, password: password)
    }

    func register(name: String, email: String, password: String) async throws -> AuthResponse {
        return try await apiClient.register(name: name, email: email, password: password)
    }

    func getCurrentUser() async throws -> User {
        return try await apiClient.getCurrentUser()
    }

    func requestPasswordReset(email: String) async throws -> String {
        return try await apiClient.requestPasswordReset(email: email)
    }

    func resetPassword(token: String, password: String) async throws -> AuthResponse {
        return try await apiClient.resetPassword(token: token, password: password)
    }

    func logout() {
        apiClient.clearToken()
    }

    var isLoggedIn: Bool {
        return apiClient.authToken != nil
    }
}