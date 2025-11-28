import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Binding var showingRegister: Bool

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showingPasswordMismatchError = false
    @State private var isHoveringCreate = false

    var body: some View {
        ZStack {
            // Background with subtle gradient
            AppTheme.background
                .ignoresSafeArea()

            // Subtle radial gradient for depth
            RadialGradient(
                gradient: Gradient(colors: [
                    AppTheme.accentSecondary.opacity(0.08),
                    Color.clear
                ]),
                center: .bottomLeading,
                startRadius: 100,
                endRadius: 400
            )
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Logo and branding
                    brandingSection
                        .padding(.top, AppTheme.spacing2XL)
                        .padding(.bottom, AppTheme.spacingXL)

                    // Register form
                    registerFormSection
                        .frame(maxWidth: 360)

                    // Footer links
                    footerSection
                        .padding(.top, AppTheme.spacingXL)
                        .padding(.bottom, AppTheme.spacingXL)
                }
                .padding(.horizontal, AppTheme.spacingXL)
            }
        }
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

    // MARK: - Branding Section
    private var brandingSection: some View {
        VStack(spacing: AppTheme.spacingLG) {
            // Icon with gradient
            ZStack {
                Circle()
                    .fill(AppTheme.accentSecondary.opacity(0.15))
                    .frame(width: 80, height: 80)
                    .blur(radius: 25)

                Image(systemName: "person.crop.circle.fill.badge.plus")
                    .font(.system(size: 48, weight: .thin))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [AppTheme.accent, AppTheme.accentSecondary],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }

            VStack(spacing: AppTheme.spacingSM) {
                Text("Create Account")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text("Start tracking your time today")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
    }

    // MARK: - Register Form Section
    private var registerFormSection: some View {
        VStack(spacing: AppTheme.spacingXL) {
            // Input fields
            VStack(spacing: AppTheme.spacingLG) {
                PremiumInputField(
                    title: "Full Name",
                    placeholder: "Enter your full name",
                    text: $name
                )

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

            // Create account button
            Button(action: register) {
                HStack(spacing: AppTheme.spacingSM) {
                    if authViewModel.isLoading {
                        ProgressView()
                            .scaleEffect(0.7)
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    }
                    Text(authViewModel.isLoading ? "Creating Account..." : "Create Account")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 20) // Fixed height to prevent layout shift when spinner appears
                .padding(.vertical, AppTheme.spacingMD + 2)
                .background(
                    Group {
                        if isFormValid {
                            LinearGradient(
                                colors: [AppTheme.accent, AppTheme.accentSecondary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        } else {
                            AppTheme.border
                        }
                    }
                )
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .shadow(color: isFormValid ? AppTheme.accent.opacity(0.3) : Color.clear, radius: isHoveringCreate ? 12 : 8, x: 0, y: isHoveringCreate ? 6 : 4)
                .scaleEffect(isHoveringCreate && isFormValid ? 1.02 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isHoveringCreate)
            }
            .buttonStyle(.plain)
            .disabled(!isFormValid || authViewModel.isLoading)
            .onHover { hovering in
                isHoveringCreate = hovering
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
            Text("Already have an account?")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(AppTheme.secondary)

            Button(action: { showingRegister = false }) {
                Text("Sign in")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppTheme.accent)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Helpers
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
        .frame(width: 420, height: 700)
        .preferredColorScheme(.dark)
}
