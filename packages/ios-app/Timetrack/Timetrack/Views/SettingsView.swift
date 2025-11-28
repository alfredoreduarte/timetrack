import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss
    
    @State private var showingProfileEdit = false
    @State private var showingLegalDocuments = false
    @State private var showingLogoutAlert = false
    @State private var showingDeleteAccountAlert = false
    @State private var showingExportData = false

    // App preferences
    @AppStorage("showNotifications") private var showNotifications = true
    @AppStorage("soundEnabled") private var soundEnabled = true
    @AppStorage("autoStartTimer") private var autoStartTimer = false
    @AppStorage("defaultHourlyRate") private var defaultHourlyRate: Double = 0.0
    @AppStorage("reminderInterval") private var reminderInterval = 30 // minutes

    // Idle timeout state
    @State private var idleTimeoutMinutes: String = String(AppConstants.defaultIdleTimeoutSeconds / 60)
    @State private var isSavingIdleTimeout = false
    @State private var idleTimeoutStatusMessage: String?
    @State private var idleTimeoutErrorMessage: String?
    
    var body: some View {
        NavigationView {
            List {
                // User Profile Section
                if let user = authViewModel.currentUser {
                    profileSection(user: user)
                }
                
                // Timer Preferences
                timerPreferencesSection
                
                // Notifications
                notificationsSection
                
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
                        dismiss()
                    }
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .onAppear {
            loadIdleTimeoutMinutes()
        }
        .onReceive(NotificationCenter.default.publisher(for: .idleTimeoutUpdated)) { notification in
            guard let seconds = notification.userInfo?["seconds"] as? Int else { return }
            idleTimeoutMinutes = String(max(1, seconds / 60))
        }
        .onChange(of: idleTimeoutMinutes) { newValue in
            let sanitized = sanitizeIdleTimeoutInput(newValue)
            if sanitized != newValue {
                idleTimeoutMinutes = sanitized
            }
            idleTimeoutStatusMessage = nil
            idleTimeoutErrorMessage = nil
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
                    Text("$\(defaultHourlyRate, specifier: "%.2f")")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                TextField("Rate", value: $defaultHourlyRate, format: .currency(code: "USD"))
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .keyboardType(.decimalPad)
                    .frame(width: 80)
            }
            
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

            VStack(alignment: .leading, spacing: 4) {
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

                    TextField("10", text: $idleTimeoutMinutes)
                        .frame(width: 60)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                        .disabled(isSavingIdleTimeout)

                    Text("min")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }

                HStack {
                    Spacer()

                    Button("Save") {
                        Task {
                            await saveIdleTimeoutPreference()
                        }
                    }
                    .disabled(isSavingIdleTimeout)
                    .font(.caption)
                }

                if let status = idleTimeoutStatusMessage {
                    Text(status)
                        .font(.caption)
                        .foregroundColor(.green)
                } else if let error = idleTimeoutErrorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }
        } header: {
            Text("Timer Settings")
        } footer: {
            Text("Timer will automatically stop when app is backgrounded for more than the idle timeout duration (1-120 minutes).")
        }
    }
    
    // MARK: - Notifications Section
    private var notificationsSection: some View {
        Section {
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

    // MARK: - Idle Timeout Helpers

    private func loadIdleTimeoutMinutes() {
        let storedSeconds = UserDefaults.standard.integer(forKey: AppConstants.idleTimeoutSecondsKey)
        let resolvedSeconds = storedSeconds > 0 ? storedSeconds : AppConstants.defaultIdleTimeoutSeconds
        idleTimeoutMinutes = String(max(1, resolvedSeconds / 60))
    }

    private func sanitizeIdleTimeoutInput(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber }
        return String(filtered.prefix(3))
    }

    private func saveIdleTimeoutPreference() async {
        guard let minutes = Int(idleTimeoutMinutes), minutes >= 1, minutes <= 120 else {
            idleTimeoutErrorMessage = "Enter between 1 and 120 minutes."
            idleTimeoutStatusMessage = nil
            return
        }

        isSavingIdleTimeout = true
        idleTimeoutErrorMessage = nil
        idleTimeoutStatusMessage = nil

        do {
            try await authViewModel.updateIdleTimeout(seconds: minutes * 60)
            idleTimeoutStatusMessage = "Idle timeout saved."
        } catch {
            idleTimeoutErrorMessage = error.localizedDescription
        }

        isSavingIdleTimeout = false
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
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("Full Name", text: $name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    
                    HStack {
                        Text("Default Hourly Rate")
                        TextField("$0.00", text: $defaultHourlyRate)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
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
                        saveProfile()
                    }
                    .disabled(isLoading || name.isEmpty || email.isEmpty)
                }
            }
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
    }
    
    private func saveProfile() {
        // TODO: Implement profile update
        dismiss()
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthViewModel())
}