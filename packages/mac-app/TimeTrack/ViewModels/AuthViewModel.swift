import Foundation
import SwiftUI

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient = APIClient.shared

    init() {
        // Check if user is already authenticated
        if apiClient.authToken != nil {
            Task {
                await checkAuthStatus()
            }
        }
    }

    // MARK: - Auth Operations
    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.login(email: email, password: password)

            // Save token and user
            apiClient.saveToken(response.token)
            currentUser = response.user
            isAuthenticated = true

        } catch {
            errorMessage = error.localizedDescription
            isAuthenticated = false
        }

        isLoading = false
    }

    func register(name: String, email: String, password: String, captchaId: String? = nil, captchaValue: String? = nil) async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.register(
                name: name,
                email: email,
                password: password,
                captchaId: captchaId,
                captchaValue: captchaValue
            )

            // Save token and user
            apiClient.saveToken(response.token)
            currentUser = response.user
            isAuthenticated = true

        } catch {
            errorMessage = error.localizedDescription
            isAuthenticated = false
        }

        isLoading = false
    }

    func logout() {
        apiClient.clearToken()
        currentUser = nil
        isAuthenticated = false
        errorMessage = nil
    }

    func checkAuthStatus() async {
        guard apiClient.authToken != nil else {
            isAuthenticated = false
            return
        }

        do {
            let user = try await apiClient.getCurrentUser()
            currentUser = user
            isAuthenticated = true
        } catch {
            // Token is invalid, clear it
            logout()
        }
    }

    func clearError() {
        errorMessage = nil
    }
}