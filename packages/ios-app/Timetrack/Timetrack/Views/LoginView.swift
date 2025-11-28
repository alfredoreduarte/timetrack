import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Binding var showingRegister: Bool

    @State private var email = ""
    @State private var password = ""
    @State private var showingAlert = false
    @State private var showingForgotPassword = false

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

                                Image(systemName: "clock.fill")
                                    .font(.system(size: 36, weight: .medium))
                                    .foregroundColor(.white)
                            }

                            VStack(spacing: AppTheme.spacingSM) {
                                Text("Welcome Back")
                                    .font(.system(size: 28, weight: .bold, design: .rounded))
                                    .foregroundColor(AppTheme.primary)

                                Text("Sign in to continue tracking")
                                    .font(.system(size: 15))
                                    .foregroundColor(AppTheme.secondary)
                            }
                        }
                        .padding(.top, 60)
                        .padding(.bottom, 40)

                        // Login Form Card
                        VStack(spacing: AppTheme.spacingXL) {
                            VStack(spacing: AppTheme.spacingLG) {
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
                            }
                            .onSubmit {
                                if !email.isEmpty && !password.isEmpty && !authViewModel.isLoading {
                                    Task {
                                        await authViewModel.login(email: email, password: password)
                                    }
                                }
                            }

                            if let errorMessage = authViewModel.errorMessage {
                                Text(errorMessage)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(AppTheme.error)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal)
                            }

                            // Sign In Button
                            Button(action: {
                                Task {
                                    await authViewModel.login(email: email, password: password)
                                }
                            }) {
                                HStack(spacing: AppTheme.spacingSM) {
                                    if authViewModel.isLoading {
                                        ProgressView()
                                            .scaleEffect(0.8)
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    }
                                    Text(authViewModel.isLoading ? "Signing in..." : "Sign In")
                                }
                            }
                            .buttonStyle(PremiumPrimaryButtonStyle())
                            .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)
                            .opacity((authViewModel.isLoading || email.isEmpty || password.isEmpty) ? 0.6 : 1)

                            // Forgot password link
                            HStack {
                                Button("Forgot password?") {
                                    showingForgotPassword = true
                                }
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.accent)

                                Spacer()
                            }
                        }
                        .padding(AppTheme.spacingXL)
                        .background(AppTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusLG))
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.radiusLG)
                                .stroke(AppTheme.border, lineWidth: 1)
                        )
                        .padding(.horizontal, AppTheme.spacingLG)

                        // Sign up link
                        HStack(spacing: AppTheme.spacingXS) {
                            Text("Don't have an account?")
                                .font(.system(size: 14))
                                .foregroundColor(AppTheme.secondary)

                            Button("Sign up") {
                                showingRegister = true
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
            .sheet(isPresented: $showingForgotPassword) {
                ForgotPasswordView()
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
}

#Preview {
    LoginView(showingRegister: .constant(false))
        .environmentObject(AuthViewModel())
}
