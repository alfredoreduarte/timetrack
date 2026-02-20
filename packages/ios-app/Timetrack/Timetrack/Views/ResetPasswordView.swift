import SwiftUI

struct ResetPasswordView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authViewModel: AuthViewModel
    
    let resetToken: String
    
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var showingPasswordMismatchError = false
    @State private var errorMessage: String?
    
    private let apiClient = APIClient.shared
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 0) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "key.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.blue)
                        
                        Text("Reset Password")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                        
                        Text("Enter your new password below")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.bottom, 40)
                    .padding(.top, 20)
                    
                    // Form
                    VStack(spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("New Password")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            SecureField("Enter new password", text: $password)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Confirm New Password")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            SecureField("Confirm new password", text: $confirmPassword)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .border(showingPasswordMismatchError ? Color.red : Color.clear, width: 1)
                        }
                        
                        if showingPasswordMismatchError {
                            Text("Passwords do not match")
                                .foregroundColor(.red)
                                .font(.caption)
                        }
                        
                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.caption)
                                .multilineTextAlignment(.center)
                        }
                        
                        Button(action: {
                            resetPassword()
                        }) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Text(isLoading ? "Resetting..." : "Reset Password")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(isFormValid ? Color.blue : Color.gray)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .disabled(!isFormValid || isLoading)
                        
                        Button("Back to Sign In") {
                            dismiss()
                        }
                        .foregroundColor(.blue)
                        .padding(.top, 10)
                    }
                    .padding(.horizontal, 40)
                    .frame(maxWidth: 400)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(UIColor.systemBackground))
            .onChange(of: confirmPassword) {
                checkPasswordMatch()
            }
            .onChange(of: password) {
                checkPasswordMatch()
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
    
    private var isFormValid: Bool {
        password.count >= 6 &&
        !confirmPassword.isEmpty &&
        password == confirmPassword
    }
    
    private func checkPasswordMatch() {
        showingPasswordMismatchError = !confirmPassword.isEmpty && password != confirmPassword
    }
    
    private func resetPassword() {
        guard isFormValid else { return }
        
        Task {
            do {
                isLoading = true
                errorMessage = nil
                
                let response = try await apiClient.resetPassword(token: resetToken, password: password)
                
                await MainActor.run {
                    // Update auth state with new credentials
                    authViewModel.setUserData(response.user, token: response.token)
                    isLoading = false
                }
                
                // Navigation will be handled by the AuthViewModel state change
            } catch {
                await MainActor.run {
                    if let apiError = error as? APIClientError {
                        switch apiError {
                        case .clientError(let message):
                            if message.contains("token") {
                                errorMessage = "Invalid or expired reset token"
                            } else {
                                errorMessage = message
                            }
                        case .unauthorized:
                            errorMessage = "Invalid or expired reset token"
                        default:
                            errorMessage = "Failed to reset password. Please try again."
                        }
                    } else {
                        errorMessage = "Failed to reset password. Please try again."
                    }
                    isLoading = false
                }
            }
        }
    }
}

// Note: This view would typically be presented when the app is opened via a deep link
// containing the reset token from the email link
#Preview {
    ResetPasswordView(resetToken: "sample-token")
        .environmentObject(AuthViewModel())
}