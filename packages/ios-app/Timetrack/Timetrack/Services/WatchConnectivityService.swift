import Foundation
import WatchConnectivity

class WatchConnectivityService: NSObject, ObservableObject {
    static let shared = WatchConnectivityService()

    private override init() {
        super.init()
        setupWatchConnectivity()
    }

    private func setupWatchConnectivity() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
            #if DEBUG
            print("iOS: WatchConnectivity activated")
            #endif
        }
    }

    func sendAuthToken(_ token: String) {
        guard WCSession.default.isReachable else {
            // Try transferring user info for background sync
            let userInfo = ["auth_token": token]
            WCSession.default.transferUserInfo(userInfo)
            return
        }

        let message = ["auth_token": token]
        WCSession.default.sendMessage(message, replyHandler: { _ in
        }, errorHandler: { error in
            #if DEBUG
            print("iOS: Failed to send auth token to Watch: \(error)")
            #endif
        })
    }

    func sendProjectsData(_ projects: [Project]) {
        let projectsData = projects.map { project in
            [
                "id": project.id,
                "name": project.name,
                "color": project.color ?? "#3B82F6"
            ]
        }

        let userInfo = ["projects": projectsData]
        WCSession.default.transferUserInfo(userInfo)
    }

    func sendDashboardData(earnings: Double, isRunning: Bool, todaysHours: Double, currentProject: String) {
        let dashboardData: [String: Any] = [
            "current_earnings": earnings,
            "is_timer_running": isRunning,
            "todays_hours": todaysHours,
            "current_project": currentProject
        ]

        let userInfo = ["dashboard": dashboardData]
        WCSession.default.transferUserInfo(userInfo)
    }

    /// Push the current timer state to the watch immediately via applicationContext.
    /// Unlike transferUserInfo, applicationContext always overwrites the previous
    /// value so the watch always sees the latest state.
    func sendTimerState(isRunning: Bool, projectName: String, startTime: String?, entryId: String?) {
        guard WCSession.default.activationState == .activated else { return }

        var context: [String: Any] = [
            "is_timer_running": isRunning,
            "current_project": projectName
        ]
        if let startTime = startTime {
            context["start_time"] = startTime
        }
        if let entryId = entryId {
            context["entry_id"] = entryId
        }

        do {
            try WCSession.default.updateApplicationContext(context)
            #if DEBUG
            print("iOS: Sent timer state to Watch (running: \(isRunning))")
            #endif
        } catch {
            #if DEBUG
            print("iOS: Failed to send timer state: \(error)")
            #endif
        }
    }

    func sendRecentEntries(_ entries: [TimeEntry]) {
        let entriesData = entries.map { entry in
            [
                "id": entry.id,
                "project_name": entry.project?.name ?? "Unknown Project",
                "task_name": entry.task?.name ?? "",
                "duration": entry.safeDuration,
                "hourly_rate": entry.hourlyRateSnapshot ?? 0.0,
                "start_time": entry.startTime
            ]
        }

        let userInfo = ["recent_entries": entriesData]
        WCSession.default.transferUserInfo(userInfo)
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        #if DEBUG
        if let error = error {
            print("iOS: WatchConnectivity activation failed: \(error)")
        }
        #endif
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
    }

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        #if DEBUG
        print("iOS: Received message from Watch: \(message)")
        #endif

        if message["request"] as? String == "start_timer",
           let projectId = message["project_id"] as? String {
            // Handle start timer request from Watch
            // You would integrate this with your existing timer logic
            replyHandler(["status": "started"])
        } else if message["request"] as? String == "stop_timer" {
            // Handle stop timer request from Watch
            replyHandler(["status": "stopped"])
        } else {
            replyHandler(["status": "unknown_request"])
        }
    }
}
