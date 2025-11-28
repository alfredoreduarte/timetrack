import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Binding var showingRegister: Bool

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showingPasswordMismatchError = false

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
                            // App icon with gradient
                            ZStack {
                                Circle()
                                    .fill(AppTheme.accentGradient)
                                    .frame(width: 80, height: 80)
                                    .shadow(color: AppTheme.accent.opacity(0.4), radius: 15, x: 0, y: 8)

                                Image(systemName: "person.crop.circle.badge.plus")
                                    .font(.system(size: 36, weight: .medium))
                                    .foregroundColor(.white)
                            }

                            VStack(spacing: AppTheme.spacingSM) {
                                Text("Create Account")
                                    .font(.system(size: 28, weight: .bold, design: .rounded))
                                    .foregroundColor(AppTheme.primary)

                                Text("Start tracking your time today")
                                    .font(.system(size: 15))
                                    .foregroundColor(AppTheme.secondary)
                            }
                        }
                        .padding(.top, 40)
                        .padding(.bottom, 32)

                        // Register Form Card
                        VStack(spacing: AppTheme.spacingXL) {
                            VStack(spacing: AppTheme.spacingLG) {
                                PremiumInputField(
                                    title: "Full Name",
                                    placeholder: "Enter your full name",
                                    text: $name,
                                    autocapitalization: .words
                                )

                                PremiumInputField(
                                    title: "Email",
                                    placeholder: "Enter your email",
                                    text: $email,
                                    keyboardType: .emailAddress,
                                    autocapitalization: .never
                                )

                                PremiumInputField(
                                    title: "Password",
                                    placeholder: "Enter your password",
                                    text: $password,
                                    isSecure: true
                                )

                                PremiumInputField(
                                    title: "Confirm Password",
                                    placeholder: "Confirm your password",
                                    text: $confirmPassword,
                                    isSecure: true,
                                    errorMessage: showingPasswordMismatchError ? "Passwords do not match" : nil
                                )
                            }
                            .onSubmit {
                                if isFormValid && !authViewModel.isLoading {
                                    register()
                                }
                            }

                            if let errorMessage = authViewModel.errorMessage {
                                Text(errorMessage)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(AppTheme.error)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal)
                            }

                            // Create Account Button
                            Button(action: {
                                register()
                            }) {
                                HStack(spacing: AppTheme.spacingSM) {
                                    if authViewModel.isLoading {
                                        ProgressView()
                                            .scaleEffect(0.8)
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    }
                                    Text(authViewModel.isLoading ? "Creating Account..." : "Create Account")
                                }
                            }
                            .buttonStyle(PremiumPrimaryButtonStyle())
                            .disabled(!isFormValid || authViewModel.isLoading)
                            .opacity((!isFormValid || authViewModel.isLoading) ? 0.6 : 1)
                        }
                        .padding(AppTheme.spacingXL)
                        .background(AppTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusLG))
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.radiusLG)
                                .stroke(AppTheme.border, lineWidth: 1)
                        )
                        .padding(.horizontal, AppTheme.spacingLG)

                        // Sign in link
                        HStack(spacing: AppTheme.spacingXS) {
                            Text("Already have an account?")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.secondary)

                            Button("Sign in") {
                                showingRegister = false
                            }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(AppTheme.accent)
                        }
                        .padding(.top, AppTheme.spacingXL)
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                authViewModel.clearError()
            }
            .onChange(of: confirmPassword) { _ in
                checkPasswordMatch()
            }
            .onChange(of: password) { _ in
                checkPasswordMatch()
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }

    private var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        password.count >= 6 &&
        password == confirmPassword
    }

    private func checkPasswordMatch() {
        showingPasswordMismatchError = !confirmPassword.isEmpty && password != confirmPassword
    }

    private func register() {
        guard isFormValid else { return }

        Task {
            await authViewModel.register(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password: password
            )
        }
    }
}

#Preview {
    RegisterView(showingRegister: .constant(true))
        .environmentObject(AuthViewModel())
}
