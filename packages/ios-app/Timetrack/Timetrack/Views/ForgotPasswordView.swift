import SwiftUI

struct ForgotPasswordView: View {
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var isLoading = false
    @State private var showingSuccessAlert = false
    @State private var errorMessage: String?
    
    private let authService = AuthService()
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 0) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "lock.circle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.blue)
                        
                        Text("Forgot Password?")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                        
                        Text("Enter your email address and we'll send you a link to reset your password")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.bottom, 40)
                    .padding(.top, 20)
                    
                    // Form
                    VStack(spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email Address")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            TextField("Enter your email", text: $email)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                        }
                        
                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .foregroundColor(.red)
                                .font(.caption)
                                .multilineTextAlignment(.center)
                        }
                        
                        Button(action: {
                            requestPasswordReset()
                        }) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                }
                                Text(isLoading ? "Sending..." : "Send Reset Link")
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
            .alert("Reset Link Sent", isPresented: $showingSuccessAlert) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("If an account with that email exists, we've sent you a password reset link. Please check your inbox.")
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
    
    private var isFormValid: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        email.contains("@") && email.contains(".")
    }
    
    private func requestPasswordReset() {
        guard isFormValid else { return }
        
        Task {
            do {
                isLoading = true
                errorMessage = nil
                
                let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                _ = try await authService.requestPasswordReset(email: trimmedEmail)
                
                // Always show success message for security
                await MainActor.run {
                    showingSuccessAlert = true
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to send reset email. Please try again."
                    isLoading = false
                }
            }
        }
    }
}

#Preview {
    ForgotPasswordView()
}