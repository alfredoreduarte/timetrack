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
            ZStack {
                // Dark background
                AppTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Header
                        VStack(spacing: AppTheme.spacingLG) {
                            // Icon with gradient
                            ZStack {
                                Circle()
                                    .fill(AppTheme.accentGradient)
                                    .frame(width: 80, height: 80)
                                    .shadow(color: AppTheme.accent.opacity(0.4), radius: 15, x: 0, y: 8)

                                Image(systemName: "lock.rotation")
                                    .font(.system(size: 36, weight: .medium))
                                    .foregroundColor(.white)
                            }

                            VStack(spacing: AppTheme.spacingSM) {
                                Text("Forgot Password?")
                                    .font(.system(size: 28, weight: .bold, design: .rounded))
                                    .foregroundColor(AppTheme.primary)

                                Text("Enter your email and we'll send you a link to reset your password")
                                    .font(.system(size: 15))
                                    .foregroundColor(AppTheme.secondary)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, AppTheme.spacingLG)
                            }
                        }
                        .padding(.top, 60)
                        .padding(.bottom, 40)

                        // Form Card
                        VStack(spacing: AppTheme.spacingXL) {
                            PremiumInputField(
                                title: "Email Address",
                                placeholder: "Enter your email",
                                text: $email,
                                keyboardType: .emailAddress,
                                autocapitalization: .never
                            )
                            .onSubmit {
                                if isFormValid && !isLoading {
                                    requestPasswordReset()
                                }
                            }

                            if let errorMessage = errorMessage {
                                Text(errorMessage)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(AppTheme.error)
                                    .multilineTextAlignment(.center)
                            }

                            // Send Reset Link Button
                            Button(action: {
                                requestPasswordReset()
                            }) {
                                HStack(spacing: AppTheme.spacingSM) {
                                    if isLoading {
                                        ProgressView()
                                            .scaleEffect(0.8)
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    }
                                    Text(isLoading ? "Sending..." : "Send Reset Link")
                                }
                            }
                            .buttonStyle(PremiumPrimaryButtonStyle())
                            .disabled(!isFormValid || isLoading)
                            .opacity((!isFormValid || isLoading) ? 0.6 : 1)

                            // Back to sign in link
                            Button("Back to Sign In") {
                                dismiss()
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.accent)
                        }
                        .padding(AppTheme.spacingXL)
                        .background(AppTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusLG))
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.radiusLG)
                                .stroke(AppTheme.border, lineWidth: 1)
                        )
                        .padding(.horizontal, AppTheme.spacingLG)
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationBarHidden(true)
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
