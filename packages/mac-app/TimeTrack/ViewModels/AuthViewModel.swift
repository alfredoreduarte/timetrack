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

    func refreshToken() async -> Bool {
        do {
            _ = try await apiClient.refreshToken()
            // Token is automatically saved by the API client
            return true
        } catch {
            // If refresh fails, logout the user
            logout()
            return false
        }
    }

    // MARK: - Helper Methods
    private func checkAuthStatus() async {
        guard apiClient.authToken != nil else {
            isAuthenticated = false
            return
        }

        do {
            currentUser = try await apiClient.getCurrentUser()
            isAuthenticated = true
        } catch {
            // If getting current user fails, try to refresh the token
            let refreshSucceeded = await refreshToken()
            if refreshSucceeded {
                // Try getting user again after refresh
                do {
                    currentUser = try await apiClient.getCurrentUser()
                    isAuthenticated = true
                } catch {
                    // If it still fails, logout
                    logout()
                }
            }
        }
    }

    func clearError() {
        errorMessage = nil
    }
}