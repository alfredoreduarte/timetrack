import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Binding var showingRegister: Bool

    @State private var email = ""
    @State private var password = ""
    @State private var showingAlert = false
    @State private var isHoveringSignIn = false

    var body: some View {
        ZStack {
            // Background with subtle gradient
            AppTheme.background
                .ignoresSafeArea()

            // Subtle radial gradient for depth
            RadialGradient(
                gradient: Gradient(colors: [
                    AppTheme.accent.opacity(0.08),
                    Color.clear
                ]),
                center: .topTrailing,
                startRadius: 100,
                endRadius: 400
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo and branding
                brandingSection
                    .padding(.bottom, AppTheme.spacing2XL)

                // Login form
                loginFormSection
                    .frame(maxWidth: 340)

                Spacer()

                // Footer links
                footerSection
                    .padding(.bottom, AppTheme.spacingXL)
            }
            .padding(.horizontal, AppTheme.spacingXL)
        }
        .alert("Password Reset", isPresented: $showingAlert) {
            Button("OK") {}
        } message: {
            Text("Password reset functionality will be available in a future update. Please contact support for assistance.")
        }
        .onAppear {
            authViewModel.clearError()
        }
    }

    // MARK: - Branding Section
    private var brandingSection: some View {
        VStack(spacing: AppTheme.spacingLG) {
            // Animated logo with glow
            ZStack {
                // Glow effect
                Circle()
                    .fill(AppTheme.accent.opacity(0.15))
                    .frame(width: 100, height: 100)
                    .blur(radius: 30)

                // Icon with gradient
                Image(systemName: "clock.circle.fill")
                    .font(.system(size: 64, weight: .thin))
                    .foregroundStyle(AppTheme.accentGradient)
            }

            VStack(spacing: AppTheme.spacingSM) {
                Text("TimeTrack")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text("Track time. Earn more.")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
    }

    // MARK: - Login Form Section
    private var loginFormSection: some View {
        VStack(spacing: AppTheme.spacingXL) {
            // Input fields
            VStack(spacing: AppTheme.spacingLG) {
                PremiumInputField(
                    title: "Email",
                    placeholder: "Enter your email",
                    text: $email
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

            // Error message
            if let errorMessage = authViewModel.errorMessage {
                HStack(spacing: AppTheme.spacingSM) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 14))
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundColor(AppTheme.error)
                .padding(AppTheme.spacingMD)
                .frame(maxWidth: .infinity)
                .background(AppTheme.error.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                        .stroke(AppTheme.error.opacity(0.3), lineWidth: 1)
                )
            }

            // Sign in button
            Button(action: {
                Task {
                    await authViewModel.login(email: email, password: password)
                }
            }) {
                HStack(spacing: AppTheme.spacingSM) {
                    if authViewModel.isLoading {
                        ProgressView()
                            .scaleEffect(0.7)
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                    Text(authViewModel.isLoading ? "Signing in..." : "Sign In")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 20) // Fixed height to prevent layout shift when spinner appears
                .padding(.vertical, AppTheme.spacingMD + 2)
                .background(
                    Group {
                        if email.isEmpty || password.isEmpty {
                            AppTheme.border
                        } else {
                            AppTheme.accentGradient
                        }
                    }
                )
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .shadow(color: (email.isEmpty || password.isEmpty) ? Color.clear : AppTheme.accent.opacity(0.3), radius: isHoveringSignIn ? 12 : 8, x: 0, y: isHoveringSignIn ? 6 : 4)
                .scaleEffect(isHoveringSignIn && !email.isEmpty && !password.isEmpty ? 1.02 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isHoveringSignIn)
            }
            .buttonStyle(.plain)
            .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)
            .onHover { hovering in
                isHoveringSignIn = hovering
            }

            // Forgot password link
            HStack {
                Button(action: { showingAlert = true }) {
                    Text("Forgot password?")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(AppTheme.accent)
                }
                .buttonStyle(.plain)

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
        .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
    }

    // MARK: - Footer Section
    private var footerSection: some View {
        HStack(spacing: AppTheme.spacingSM) {
            Text("Don't have an account?")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(AppTheme.secondary)

            Button(action: { showingRegister = true }) {
                Text("Sign up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppTheme.accent)
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview {
    LoginView(showingRegister: .constant(false))
        .environmentObject(AuthViewModel())
        .frame(width: 420, height: 600)
        .preferredColorScheme(.dark)
}
