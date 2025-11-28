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
                List {
                    // User Profile Section
                    if let user = authViewModel.currentUser {
                        profileSection(user: user)
                    }

                    // Timer Preferences
                    timerPreferencesSection

                    // Notifications (TODO: Backend support needed)
                    // notificationsSection

                    // Data Management
                    dataManagementSection

                    // App Information
                    appInformationSection

                    // Legal & Privacy
                    legalSection

                    // Account Actions
                    accountActionsSection
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
                        .fontWeight(hasUnsavedChanges ? .semibold : .regular)
                    }
                }
                .disabled(isSaving)
                .blur(radius: isSaving ? 2 : 0)

                // Loading overlay
                if isSaving {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()
                        .overlay {
                            ProgressView("Saving...")
                                .padding()
                                .background(Color(.systemBackground))
                                .cornerRadius(10)
                                .shadow(radius: 5)
                        }
                }
            }
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
        Section {
            HStack {
                Circle()
                    .fill(Color.blue.gradient)
                    .frame(width: 60, height: 60)
                    .overlay {
                        Text(String(user.name.first?.uppercased() ?? "U"))
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.name)
                        .font(.headline)
                    Text(user.email)
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    if let rate = user.defaultHourlyRate {
                        Text("$\(rate, specifier: "%.2f")/hour")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.2))
                            .foregroundColor(.green)
                            .cornerRadius(4)
                    }
                }

                Spacer()

                Button("Edit") {
                    showingProfileEdit = true
                }
                .foregroundColor(.blue)
            }
            .padding(.vertical, 8)
        } header: {
            Text("Profile")
        }
    }

    // MARK: - Timer Preferences Section
    private var timerPreferencesSection: some View {
        Section {
            HStack {
                Image(systemName: "clock")
                    .foregroundColor(.blue)
                    .frame(width: 24)

                VStack(alignment: .leading) {
                    Text("Default Hourly Rate")
                    if !editedDefaultHourlyRate.isEmpty {
                        Text("$\(editedDefaultHourlyRate)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                TextField("0.00", text: $editedDefaultHourlyRate)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .keyboardType(.decimalPad)
                    .frame(width: 80)
            }

            // TODO: Add backend support for reminder intervals to notify users periodically while timer is running
            /*
            HStack {
                Image(systemName: "bell")
                    .foregroundColor(.orange)
                    .frame(width: 24)

                VStack(alignment: .leading) {
                    Text("Reminder Interval")
                    Text("Every \(reminderInterval) minutes")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Picker("Minutes", selection: $reminderInterval) {
                    Text("15 min").tag(15)
                    Text("30 min").tag(30)
                    Text("60 min").tag(60)
                    Text("Off").tag(0)
                }
                .pickerStyle(MenuPickerStyle())
            }
            */

            // TODO: Add automatic timer start feature when opening app or selecting project
            /*
            Toggle(isOn: $autoStartTimer) {
                HStack {
                    Image(systemName: "play.circle")
                        .foregroundColor(.green)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text("Auto-start Timer")
                        Text("Start timer when opening app")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            */

            HStack {
                Image(systemName: "moon.zzz")
                    .foregroundColor(.indigo)
                    .frame(width: 24)

                VStack(alignment: .leading) {
                    Text("Idle Timeout")
                    Text("Auto-stop timer after inactivity")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                TextField("10", text: $editedIdleTimeoutMinutes)
                    .frame(width: 60)
                    .multilineTextAlignment(.trailing)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)

                Text("min")
                    .foregroundColor(.secondary)
                    .font(.caption)
            }
        } header: {
            Text("Timer Settings")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Timer will automatically stop when app is backgrounded for more than the idle timeout duration (1-120 minutes).")
                if hasUnsavedChanges {
                    Text("Tap Done to save your changes.")
                        .foregroundColor(.orange)
                        .font(.caption)
                }
            }
        }
    }

    // MARK: - Notifications Section (TODO: Backend support needed)
    private var notificationsSection: some View {
        Section {
            // TODO: Integrate with iOS push notifications for timer reminders and important updates
            Toggle(isOn: $showNotifications) {
                HStack {
                    Image(systemName: "bell.badge")
                        .foregroundColor(.red)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text("Notifications")
                        Text("Timer reminders and updates")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            // TODO: Add sound effects for timer start/stop events for better user feedback
            Toggle(isOn: $soundEnabled) {
                HStack {
                    Image(systemName: "speaker.wave.2")
                        .foregroundColor(.purple)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text("Sound Effects")
                        Text("Timer start/stop sounds")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .disabled(!showNotifications)
        } header: {
            Text("Notifications")
        } footer: {
            Text("You can manage notification permissions in iOS Settings.")
        }
    }

    // MARK: - Data Management Section
    private var dataManagementSection: some View {
        Section {
            Button(action: {
                showingExportData = true
            }) {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundColor(.blue)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text("Export Data")
                            .foregroundColor(.primary)
                        Text("Download your time tracking data")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            // TODO: Implement automatic data sync across devices using CloudKit or similar
            /*
            Button(action: {
                // TODO: Implement data sync
            }) {
                HStack {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundColor(.green)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text("Sync Data")
                            .foregroundColor(.primary)
                        Text("Sync with other devices")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            */
        } header: {
            Text("Data Management")
        }
    }

    // MARK: - App Information Section
    private var appInformationSection: some View {
        Section {
            HStack {
                Text("Version")
                Spacer()
                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                    .foregroundColor(.secondary)
            }

            HStack {
                Text("Build")
                Spacer()
                Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                    .foregroundColor(.secondary)
            }

            Button(action: {
                if let url = URL(string: "https://apps.apple.com/app/timetrack/id[APP_ID]") {
                    UIApplication.shared.open(url)
                }
            }) {
                HStack {
                    Text("Rate TimeTrack")
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: "star")
                        .foregroundColor(.orange)
                }
            }

            Button(action: {
                if let url = URL(string: "mailto:support@timetrack.app?subject=Feedback") {
                    UIApplication.shared.open(url)
                }
            }) {
                HStack {
                    Text("Send Feedback")
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: "envelope")
                        .foregroundColor(.blue)
                }
            }
        } header: {
            Text("About TimeTrack")
        }
    }

    // MARK: - Legal Section
    private var legalSection: some View {
        Section {
            Button(action: {
                showingLegalDocuments = true
            }) {
                HStack {
                    Text("Privacy & Legal")
                        .foregroundColor(.primary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        } header: {
            Text("Legal")
        }
    }

    // MARK: - Account Actions Section
    private var accountActionsSection: some View {
        Section {
            Button("Sign Out") {
                showingLogoutAlert = true
            }
            .foregroundColor(.red)

            Button("Delete Account") {
                showingDeleteAccountAlert = true
            }
            .foregroundColor(.red)
        } header: {
            Text("Account")
        } footer: {
            Text("Account deletion is permanent and cannot be undone.")
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
            Form {
                Section {
                    TextField("Full Name", text: $name)
                        .onChange(of: name) { _ in hasUnsavedChanges = true }

                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .onChange(of: email) { _ in hasUnsavedChanges = true }

                    HStack {
                        Text("Default Hourly Rate")
                        TextField("$0.00", text: $defaultHourlyRate)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .onChange(of: defaultHourlyRate) { _ in hasUnsavedChanges = true }
                    }
                } header: {
                    Text("Profile Information")
                } footer: {
                    Text("Your email is used for account authentication and important notifications.")
                }

                if let errorMessage = errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .font(.caption)
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            await saveProfile()
                        }
                    }
                    .disabled(isLoading || !hasUnsavedChanges || name.isEmpty || email.isEmpty)
                    .fontWeight(hasUnsavedChanges ? .semibold : .regular)
                }
            }
            .disabled(isLoading)
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .onAppear {
            loadUserData()
        }
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