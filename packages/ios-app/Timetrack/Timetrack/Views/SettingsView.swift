import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss

    @State private var showingProfileEdit = false
    @State private var showingLegalDocuments = false
    @State private var showingLogoutAlert = false
    @State private var showingDeleteAccountAlert = false
    @State private var showingExportData = false
    @State private var showingUnsavedChangesAlert = false

    // App preferences - Local storage only (TODO: Add backend support)
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("soundEnabled") private var soundEnabled = true
    @AppStorage("autoStartTimer") private var autoStartTimer = false
    @AppStorage("reminderInterval") private var reminderInterval = 30 // minutes

    // Editable profile fields
    @State private var editedDefaultHourlyRate: String = ""
    @State private var editedIdleTimeoutMinutes: String = ""

    // Save state
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var hasUnsavedChanges = false

    var body: some View {
        NavigationView {
            ZStack {
                // Dark background
                AppTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.spacingLG) {
                        // User Profile Section
                        if let user = authViewModel.currentUser {
                            profileSection(user: user)
                        }

                        // Timer Preferences
                        timerPreferencesSection

                        // Data Management
                        dataManagementSection

                        // App Information
                        appInformationSection

                        // Legal & Privacy
                        legalSection

                        // Account Actions
                        accountActionsSection
                    }
                    .padding(AppTheme.spacingLG)
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            if hasUnsavedChanges {
                                Task {
                                    await saveChanges()
                                }
                            } else {
                                dismiss()
                            }
                        }
                        .font(.system(size: 15, weight: hasUnsavedChanges ? .semibold : .regular))
                        .foregroundColor(AppTheme.accent)
                    }
                }
                .disabled(isSaving)
                .blur(radius: isSaving ? 2 : 0)

                // Loading overlay
                if isSaving {
                    Color.black.opacity(0.5)
                        .ignoresSafeArea()
                        .overlay {
                            VStack(spacing: AppTheme.spacingMD) {
                                ProgressView()
                                    .scaleEffect(1.2)
                                    .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.accent))

                                Text("Saving...")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(AppTheme.primary)
                            }
                            .padding(AppTheme.spacingXL)
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                        }
                }
            }
            .toolbarBackground(AppTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .onAppear {
            loadCurrentValues()
        }
        .onChange(of: editedDefaultHourlyRate) { _ in
            checkForUnsavedChanges()
        }
        .onChange(of: editedIdleTimeoutMinutes) { newValue in
            let sanitized = sanitizeIdleTimeoutInput(newValue)
            if sanitized != newValue {
                editedIdleTimeoutMinutes = sanitized
            }
            checkForUnsavedChanges()
        }
        .alert("Save Error", isPresented: .constant(saveError != nil)) {
            Button("OK") {
                saveError = nil
            }
        } message: {
            Text(saveError ?? "An error occurred while saving.")
        }
        .alert("Unsaved Changes", isPresented: $showingUnsavedChangesAlert) {
            Button("Discard", role: .destructive) {
                dismiss()
            }
            Button("Save") {
                Task {
                    await saveChanges()
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("You have unsaved changes. Do you want to save them before leaving?")
        }
        .sheet(isPresented: $showingProfileEdit) {
            ProfileEditView()
        }
        .sheet(isPresented: $showingLegalDocuments) {
            LegalDocumentsView()
        }
        .alert("Sign Out", isPresented: $showingLogoutAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Sign Out", role: .destructive) {
                authViewModel.logout()
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
        .alert("Delete Account", isPresented: $showingDeleteAccountAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                // TODO: Implement account deletion
            }
        } message: {
            Text("This action cannot be undone. All your data will be permanently deleted.")
        }
    }

    // MARK: - Profile Section
    private func profileSection(user: User) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Profile")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            HStack(spacing: AppTheme.spacingMD) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(AppTheme.accentGradient)
                        .frame(width: 56, height: 56)

                    Text(String(user.name.first?.uppercased() ?? "U"))
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: AppTheme.spacingXS) {
                    Text(user.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(AppTheme.primary)

                    Text(user.email)
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.secondary)

                    if let rate = user.defaultHourlyRate {
                        Text(String(format: "$%.2f/hour", rate))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.earnings)
                            .padding(.horizontal, AppTheme.spacingSM)
                            .padding(.vertical, 2)
                            .background(AppTheme.earnings.opacity(0.15))
                            .clipShape(Capsule())
                    }
                }

                Spacer()

                Button("Edit") {
                    showingProfileEdit = true
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AppTheme.accent)
            }
            .padding(AppTheme.spacingLG)
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Timer Preferences Section
    private var timerPreferencesSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Timer Settings")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                // Default Hourly Rate
                HStack {
                    HStack(spacing: AppTheme.spacingMD) {
                        Image(systemName: "dollarsign.circle")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.earnings)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Default Hourly Rate")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.primary)

                            if !editedDefaultHourlyRate.isEmpty {
                                Text("$\(editedDefaultHourlyRate)")
                                    .font(.system(size: 12))
                                    .foregroundColor(AppTheme.secondary)
                            }
                        }
                    }

                    Spacer()

                    TextField("0.00", text: $editedDefaultHourlyRate)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.primary)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.decimalPad)
                        .frame(width: 70)
                        .padding(AppTheme.spacingSM)
                        .background(AppTheme.backgroundElevated)
                        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                }
                .padding(AppTheme.spacingMD)

                Divider()
                    .background(AppTheme.border)

                // Idle Timeout
                HStack {
                    HStack(spacing: AppTheme.spacingMD) {
                        Image(systemName: "moon.zzz")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.accent)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Idle Timeout")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.primary)

                            Text("Auto-stop after inactivity")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.secondary)
                        }
                    }

                    Spacer()

                    HStack(spacing: AppTheme.spacingXS) {
                        TextField("10", text: $editedIdleTimeoutMinutes)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.primary)
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.numberPad)
                            .frame(width: 50)
                            .padding(AppTheme.spacingSM)
                            .background(AppTheme.backgroundElevated)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))

                        Text("min")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.tertiary)
                    }
                }
                .padding(AppTheme.spacingMD)
            }
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.border, lineWidth: 1)
            )

            if hasUnsavedChanges {
                Text("Tap Done to save your changes")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.warning)
            } else {
                Text("Timer will auto-stop when app is backgrounded for more than the idle timeout (1-120 min)")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
    }

    // MARK: - Data Management Section
    private var dataManagementSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Data Management")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            Button(action: {
                showingExportData = true
            }) {
                HStack {
                    HStack(spacing: AppTheme.spacingMD) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 18))
                            .foregroundColor(AppTheme.accent)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Export Data")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(AppTheme.primary)

                            Text("Download your time tracking data")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.secondary)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(AppTheme.tertiary)
                }
                .padding(AppTheme.spacingMD)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
            }
        }
    }

    // MARK: - App Information Section
    private var appInformationSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("About TimeTrack")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                HStack {
                    Text("Version")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.primary)

                    Spacer()

                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.secondary)
                }
                .padding(AppTheme.spacingMD)

                Divider()
                    .background(AppTheme.border)

                HStack {
                    Text("Build")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.primary)

                    Spacer()

                    Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.secondary)
                }
                .padding(AppTheme.spacingMD)

                Divider()
                    .background(AppTheme.border)

                Button(action: {
                    if let url = URL(string: "https://apps.apple.com/app/timetrack/id[APP_ID]") {
                        UIApplication.shared.open(url)
                    }
                }) {
                    HStack {
                        Text("Rate TimeTrack")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.primary)

                        Spacer()

                        Image(systemName: "star")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.warning)
                    }
                    .padding(AppTheme.spacingMD)
                }

                Divider()
                    .background(AppTheme.border)

                Button(action: {
                    if let url = URL(string: "mailto:support@timetrack.app?subject=Feedback") {
                        UIApplication.shared.open(url)
                    }
                }) {
                    HStack {
                        Text("Send Feedback")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.primary)

                        Spacer()

                        Image(systemName: "envelope")
                            .font(.system(size: 14))
                            .foregroundColor(AppTheme.accent)
                    }
                    .padding(AppTheme.spacingMD)
                }
            }
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Legal Section
    private var legalSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Legal")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            Button(action: {
                showingLegalDocuments = true
            }) {
                HStack {
                    Text("Privacy & Legal")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(AppTheme.primary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(AppTheme.tertiary)
                }
                .padding(AppTheme.spacingMD)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Account Actions Section
    private var accountActionsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
            Text("Account")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.secondary)
                .textCase(.uppercase)

            VStack(spacing: 0) {
                Button(action: {
                    showingLogoutAlert = true
                }) {
                    HStack {
                        Text("Sign Out")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.error)

                        Spacer()
                    }
                    .padding(AppTheme.spacingMD)
                }

                Divider()
                    .background(AppTheme.border)

                Button(action: {
                    showingDeleteAccountAlert = true
                }) {
                    HStack {
                        Text("Delete Account")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(AppTheme.error)

                        Spacer()
                    }
                    .padding(AppTheme.spacingMD)
                }
            }
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.border, lineWidth: 1)
            )

            Text("Account deletion is permanent and cannot be undone.")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.tertiary)
        }
    }

    // MARK: - Helper Methods

    private func loadCurrentValues() {
        guard let user = authViewModel.currentUser else { return }

        // Load current user values
        editedDefaultHourlyRate = user.defaultHourlyRate?.description ?? ""

        // Load idle timeout
        let storedSeconds = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
        let resolvedSeconds = storedSeconds > 0 ? storedSeconds : (user.idleTimeoutSeconds ?? AppConstants.defaultIdleTimeoutSeconds)
        editedIdleTimeoutMinutes = String(max(1, resolvedSeconds / 60))

        // Reset change tracking
        hasUnsavedChanges = false
    }

    private func sanitizeIdleTimeoutInput(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber }
        return String(filtered.prefix(3))
    }

    private func checkForUnsavedChanges() {
        guard let user = authViewModel.currentUser else {
            hasUnsavedChanges = false
            return
        }

        // Check if default hourly rate changed
        let currentRate = user.defaultHourlyRate?.description ?? ""
        if editedDefaultHourlyRate != currentRate {
            hasUnsavedChanges = true
            return
        }

        // Check if idle timeout changed
        let storedSeconds = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
        let currentSeconds = storedSeconds > 0 ? storedSeconds : (user.idleTimeoutSeconds ?? AppConstants.defaultIdleTimeoutSeconds)
        let currentMinutes = String(max(1, currentSeconds / 60))
        if editedIdleTimeoutMinutes != currentMinutes {
            hasUnsavedChanges = true
            return
        }

        hasUnsavedChanges = false
    }

    private func saveChanges() async {
        // Validate idle timeout
        guard let minutes = Int(editedIdleTimeoutMinutes), minutes >= 1, minutes <= 120 else {
            saveError = "Idle timeout must be between 1 and 120 minutes."
            return
        }

        isSaving = true
        saveError = nil

        do {
            // Parse default hourly rate (can be empty)
            let hourlyRate: Double? = editedDefaultHourlyRate.isEmpty ? nil : Double(editedDefaultHourlyRate)

            // Only send changed values
            var hasChanges = false
            var name: String? = nil
            var email: String? = nil
            var defaultHourlyRate: Double? = nil
            var idleTimeoutSeconds: Int? = nil

            if let user = authViewModel.currentUser {
                // Check hourly rate change
                if hourlyRate != user.defaultHourlyRate {
                    defaultHourlyRate = hourlyRate
                    hasChanges = true
                }

                // Check idle timeout change
                let storedSeconds = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
                let currentSeconds = storedSeconds > 0 ? storedSeconds : (user.idleTimeoutSeconds ?? AppConstants.defaultIdleTimeoutSeconds)
                let newSeconds = minutes * 60
                if newSeconds != currentSeconds {
                    idleTimeoutSeconds = newSeconds
                    hasChanges = true
                }
            }

            if hasChanges {
                try await authViewModel.updateProfile(
                    name: name,
                    email: email,
                    defaultHourlyRate: defaultHourlyRate,
                    idleTimeoutSeconds: idleTimeoutSeconds
                )
            }

            hasUnsavedChanges = false
            // Dismiss immediately after successful save - this is the expected iOS behavior
            dismiss()

        } catch {
            saveError = error.localizedDescription
        }

        isSaving = false
    }
}

// MARK: - Profile Edit View
struct ProfileEditView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var defaultHourlyRate: String = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var hasUnsavedChanges = false

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.spacingLG) {
                        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
                            Text("Profile Information")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.secondary)
                                .textCase(.uppercase)

                            VStack(spacing: AppTheme.spacingLG) {
                                PremiumInputField(
                                    title: "Full Name",
                                    placeholder: "Enter your name",
                                    text: $name
                                )

                                PremiumInputField(
                                    title: "Email",
                                    placeholder: "Enter your email",
                                    text: $email,
                                    keyboardType: .emailAddress,
                                    autocapitalization: .never
                                )

                                VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
                                    Text("Default Hourly Rate")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(AppTheme.primary)

                                    HStack {
                                        Text("$")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(AppTheme.secondary)

                                        TextField("0.00", text: $defaultHourlyRate)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(AppTheme.primary)
                                            .keyboardType(.decimalPad)
                                    }
                                    .padding(AppTheme.spacingMD)
                                    .background(AppTheme.cardBackground)
                                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                                            .stroke(AppTheme.border, lineWidth: 1)
                                    )
                                }
                            }
                            .padding(AppTheme.spacingLG)
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                            .overlay(
                                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                                    .stroke(AppTheme.border, lineWidth: 1)
                            )

                            Text("Your email is used for account authentication and important notifications.")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.tertiary)
                        }

                        if let errorMessage = errorMessage {
                            Text(errorMessage)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(AppTheme.error)
                        }
                    }
                    .padding(AppTheme.spacingLG)
                }
                .navigationTitle("Edit Profile")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Cancel") {
                            dismiss()
                        }
                        .foregroundColor(AppTheme.secondary)
                    }

                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Save") {
                            Task {
                                await saveProfile()
                            }
                        }
                        .disabled(isLoading || !hasUnsavedChanges || name.isEmpty || email.isEmpty)
                        .font(.system(size: 15, weight: hasUnsavedChanges ? .semibold : .regular))
                        .foregroundColor(AppTheme.accent)
                    }
                }
                .disabled(isLoading)
                .toolbarBackground(AppTheme.background, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .onAppear {
            loadUserData()
        }
        .onChange(of: name) { _ in hasUnsavedChanges = true }
        .onChange(of: email) { _ in hasUnsavedChanges = true }
        .onChange(of: defaultHourlyRate) { _ in hasUnsavedChanges = true }
    }

    private func loadUserData() {
        if let user = authViewModel.currentUser {
            name = user.name
            email = user.email
            defaultHourlyRate = user.defaultHourlyRate?.description ?? ""
        }
        hasUnsavedChanges = false
    }

    private func saveProfile() async {
        isLoading = true
        errorMessage = nil

        do {
            // Parse hourly rate
            let hourlyRate: Double? = defaultHourlyRate.isEmpty ? nil : Double(defaultHourlyRate)

            // Update profile
            try await authViewModel.updateProfile(
                name: name,
                email: email,
                defaultHourlyRate: hourlyRate
            )

            dismiss()

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthViewModel())
}
