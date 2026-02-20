import SwiftUI
import WatchKit
import WatchConnectivity
import Security

@main
struct TimeTrackWatchApp: App {
    @StateObject private var watchConnectivity = WatchConnectivityManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(watchConnectivity)
        }
    }
}

// MARK: - Watch Connectivity Manager
class WatchConnectivityManager: NSObject, ObservableObject {
    @Published var currentEarnings: Double = 0.0
    @Published var isTimerRunning = false
    @Published var currentProject: String = "No Active Project"
    @Published var todaysHours: Double = 0.0
    @Published var recentEntries: [WatchTimeEntry] = []
    @Published var projects: [WatchProject] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private var authToken: String?

    override init() {
        super.init()
        setupWatchConnectivity()
        loadStoredData()
    }

    private func setupWatchConnectivity() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
            #if DEBUG
            print("Watch: WatchConnectivity activated")
            #endif
        }
    }

    // NOTE: Service, account, and access group must match KeychainHelper.swift in the main app target.
    private func getTokenFromKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.timetrack.ios",
            kSecAttrAccount as String: "timetrack_auth_token",
            kSecAttrAccessGroup as String: "group.com.timetrack.shared",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func saveTokenToKeychain(_ token: String) {
        guard let data = token.data(using: .utf8) else { return }

        // Delete existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.timetrack.ios",
            kSecAttrAccount as String: "timetrack_auth_token",
            kSecAttrAccessGroup as String: "group.com.timetrack.shared"
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.timetrack.ios",
            kSecAttrAccount as String: "timetrack_auth_token",
            kSecAttrAccessGroup as String: "group.com.timetrack.shared",
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    private func loadStoredData() {
        // Load auth token from Keychain, migrating from UserDefaults if needed
        if let token = getTokenFromKeychain() {
            authToken = token
        } else if let tokenData = UserDefaults.standard.data(forKey: "cached_auth_token"),
                  let token = String(data: tokenData, encoding: .utf8) {
            // One-time migration from UserDefaults to Keychain
            authToken = token
            saveTokenToKeychain(token)
            UserDefaults.standard.removeObject(forKey: "cached_auth_token")
        }

        // Load non-sensitive cached data from UserDefaults
        if let projectsData = UserDefaults.standard.data(forKey: "cached_projects"),
           let projectsArray = try? JSONDecoder().decode([WatchProject].self, from: projectsData) {
            projects = projectsArray
        }

        if let entriesData = UserDefaults.standard.data(forKey: "cached_recent_entries"),
           let entriesArray = try? JSONDecoder().decode([WatchTimeEntry].self, from: entriesData) {
            recentEntries = entriesArray
        }

        currentEarnings = UserDefaults.standard.double(forKey: "cached_earnings")
        todaysHours = UserDefaults.standard.double(forKey: "cached_todays_hours")
        isTimerRunning = UserDefaults.standard.bool(forKey: "cached_timer_running")
        currentProject = UserDefaults.standard.string(forKey: "cached_current_project") ?? "No Active Project"

        // Request fresh data from iPhone
        requestDataFromiPhone()
    }
    
    private func requestDataFromiPhone() {
        guard WCSession.default.activationState == .activated else { return }
        
        let request = ["request": "sync_all_data"]
        
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(request, replyHandler: nil) { error in
                #if DEBUG
                print("Watch: Failed to request data: \(error)")
                #endif
            }
        }
    }
    
    private func saveDataToCache() {
        // Save auth token to Keychain (not UserDefaults)
        if let token = authToken {
            saveTokenToKeychain(token)
        }

        // Cache non-sensitive data in UserDefaults
        if let projectsData = try? JSONEncoder().encode(projects) {
            UserDefaults.standard.set(projectsData, forKey: "cached_projects")
        }
        
        // Cache recent entries
        if let entriesData = try? JSONEncoder().encode(recentEntries) {
            UserDefaults.standard.set(entriesData, forKey: "cached_recent_entries")
        }
        
        // Cache dashboard data
        UserDefaults.standard.set(currentEarnings, forKey: "cached_earnings")
        UserDefaults.standard.set(todaysHours, forKey: "cached_todays_hours")
        UserDefaults.standard.set(isTimerRunning, forKey: "cached_timer_running")
        UserDefaults.standard.set(currentProject, forKey: "cached_current_project")
    }
    
    func startTimer(for project: WatchProject) {
        guard WCSession.default.isReachable else {
            errorMessage = "iPhone not reachable. Make sure your iPhone is nearby and the TimeTrack app is open."
            return
        }
        
        let message = ["request": "start_timer", "project_id": project.id]
        WCSession.default.sendMessage(message, replyHandler: { reply in
            DispatchQueue.main.async {
                if reply["status"] as? String == "started" {
                    self.currentProject = project.name
                    self.isTimerRunning = true
                    self.saveDataToCache()
                }
            }
        }, errorHandler: { error in
            DispatchQueue.main.async {
                self.errorMessage = "Failed to start timer: \(error.localizedDescription)"
            }
        })
    }
    
    func stopTimer() {
        guard WCSession.default.isReachable else {
            errorMessage = "iPhone not reachable. Make sure your iPhone is nearby and the TimeTrack app is open."
            return
        }
        
        let message = ["request": "stop_timer"]
        WCSession.default.sendMessage(message, replyHandler: { reply in
            DispatchQueue.main.async {
                if reply["status"] as? String == "stopped" {
                    self.isTimerRunning = false
                    self.currentProject = "No Active Project"
                    self.saveDataToCache()
                }
            }
        }, errorHandler: { error in
            DispatchQueue.main.async {
                self.errorMessage = "Failed to stop timer: \(error.localizedDescription)"
            }
        })
    }
    
    func restartEntry(_ entry: WatchTimeEntry) {
        if let project = projects.first(where: { $0.name == entry.projectName }) {
            startTimer(for: project)
        }
    }
    
    func refresh() {
        requestDataFromiPhone()
    }
}

// MARK: - WCSessionDelegate
extension WatchConnectivityManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error {
            #if DEBUG
            print("Watch: WatchConnectivity activation failed: \(error)")
            #endif
        } else {
            DispatchQueue.main.async {
                self.requestDataFromiPhone()
            }
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        DispatchQueue.main.async {
            // Handle auth token
            if let token = userInfo["auth_token"] as? String {
                self.authToken = token
            }

            // Handle projects data
            if let projectsData = userInfo["projects"] as? [[String: Any]] {
                self.projects = projectsData.compactMap { dict in
                    guard let id = dict["id"] as? String,
                          let name = dict["name"] as? String,
                          let color = dict["color"] as? String else { return nil }
                    return WatchProject(id: id, name: name, color: color)
                }
            }

            // Handle dashboard data
            if let dashboardData = userInfo["dashboard"] as? [String: Any] {
                self.currentEarnings = dashboardData["current_earnings"] as? Double ?? 0.0
                self.isTimerRunning = dashboardData["is_timer_running"] as? Bool ?? false
                self.todaysHours = dashboardData["todays_hours"] as? Double ?? 0.0
                self.currentProject = dashboardData["current_project"] as? String ?? "No Active Project"
            }

            // Handle recent entries
            if let entriesData = userInfo["recent_entries"] as? [[String: Any]] {
                self.recentEntries = entriesData.compactMap { dict in
                    guard let id = dict["id"] as? String,
                          let projectName = dict["project_name"] as? String,
                          let duration = dict["duration"] as? Int,
                          let hourlyRate = dict["hourly_rate"] as? Double,
                          let startTime = dict["start_time"] as? String else { return nil }

                    let taskName = dict["task_name"] as? String
                    let date = self.parseDate(startTime)

                    return WatchTimeEntry(
                        id: id,
                        projectName: projectName,
                        taskName: taskName?.isEmpty == false ? taskName : nil,
                        duration: TimeInterval(duration),
                        hourlyRate: hourlyRate,
                        date: date
                    )
                }
            }

            self.saveDataToCache()
            self.errorMessage = nil
            self.isLoading = false
        }
    }
    
    private func parseDate(_ dateString: String) -> Date {
        WatchDateUtils.parseISO8601(dateString) ?? Date()
    }
}

