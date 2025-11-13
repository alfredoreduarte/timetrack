import SwiftUI
import WatchKit
import WatchConnectivity

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
            print("⌚ Watch: WatchConnectivity activated")
        }
    }
    
    private func loadStoredData() {
        // Load cached data from UserDefaults
        if let tokenData = UserDefaults.standard.data(forKey: "cached_auth_token"),
           let token = String(data: tokenData, encoding: .utf8) {
            authToken = token
            print("⌚ Watch: Loaded cached auth token")
        }
        
        if let projectsData = UserDefaults.standard.data(forKey: "cached_projects"),
           let projectsArray = try? JSONDecoder().decode([WatchProject].self, from: projectsData) {
            projects = projectsArray
            print("⌚ Watch: Loaded \(projects.count) cached projects")
        }
        
        if let entriesData = UserDefaults.standard.data(forKey: "cached_recent_entries"),
           let entriesArray = try? JSONDecoder().decode([WatchTimeEntry].self, from: entriesData) {
            recentEntries = entriesArray
            print("⌚ Watch: Loaded \(recentEntries.count) cached entries")
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
                print("⌚ Watch: Failed to request data: \(error)")
            }
        }
    }
    
    private func saveDataToCache() {
        // Cache auth token
        if let token = authToken {
            UserDefaults.standard.set(token.data(using: .utf8), forKey: "cached_auth_token")
        }
        
        // Cache projects
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
            print("⌚ Watch: WatchConnectivity activation failed: \(error)")
        } else {
            print("⌚ Watch: WatchConnectivity activated successfully")
            DispatchQueue.main.async {
                self.requestDataFromiPhone()
            }
        }
    }
    
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        print("⌚ Watch: Received user info: \(userInfo.keys)")
        
        DispatchQueue.main.async {
            // Handle auth token
            if let token = userInfo["auth_token"] as? String {
                self.authToken = token
                print("⌚ Watch: Received auth token from iPhone")
            }
            
            // Handle projects data
            if let projectsData = userInfo["projects"] as? [[String: Any]] {
                self.projects = projectsData.compactMap { dict in
                    guard let id = dict["id"] as? String,
                          let name = dict["name"] as? String,
                          let color = dict["color"] as? String else { return nil }
                    return WatchProject(id: id, name: name, color: color)
                }
                print("⌚ Watch: Received \(self.projects.count) projects from iPhone")
            }
            
            // Handle dashboard data
            if let dashboardData = userInfo["dashboard"] as? [String: Any] {
                self.currentEarnings = dashboardData["current_earnings"] as? Double ?? 0.0
                self.isTimerRunning = dashboardData["is_timer_running"] as? Bool ?? false
                self.todaysHours = dashboardData["todays_hours"] as? Double ?? 0.0
                self.currentProject = dashboardData["current_project"] as? String ?? "No Active Project"
                print("⌚ Watch: Received dashboard data from iPhone")
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
                print("⌚ Watch: Received \(self.recentEntries.count) recent entries from iPhone")
            }
            
            self.saveDataToCache()
            self.errorMessage = nil
            self.isLoading = false
        }
    }
    
    private func parseDate(_ dateString: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        if let date = formatter.date(from: dateString) {
            return date
        }
        
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: dateString) ?? Date()
    }
}

