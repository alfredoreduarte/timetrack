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
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 16) {
                Image(systemName: "person.crop.circle.fill.badge.plus")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)

                Text("Create your account")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                Text("Start tracking your time today")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 40)

            // Register Form
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Full Name")
                        .font(.headline)
                        .foregroundColor(.primary)

                    TextField("Enter your full name", text: $name)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Email Address")
                        .font(.headline)
                        .foregroundColor(.primary)

                    TextField("Enter your email", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Password")
                        .font(.headline)
                        .foregroundColor(.primary)

                    SecureField("Enter your password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Confirm Password")
                        .font(.headline)
                        .foregroundColor(.primary)

                    SecureField("Confirm your password", text: $confirmPassword)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .border(showingPasswordMismatchError ? Color.red : Color.clear, width: 1)
                }

                if showingPasswordMismatchError {
                    Text("Passwords do not match")
                        .foregroundColor(.red)
                        .font(.caption)
                }

                if let errorMessage = authViewModel.errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                }

                Button(action: {
                    register()
                }) {
                    HStack {
                        if authViewModel.isLoading {
                            ProgressView()
                                .scaleEffect(0.8)
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        }
                        Text(authViewModel.isLoading ? "Creating Account..." : "Create Account")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isFormValid ? Color.blue : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .disabled(!isFormValid || authViewModel.isLoading)

                HStack {
                    Text("Already have an account?")
                        .foregroundColor(.secondary)

                    Button("Sign in") {
                        showingRegister = false
                    }
                    .foregroundColor(.blue)
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 40)
            .frame(maxWidth: 400)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(NSColor.windowBackgroundColor))
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