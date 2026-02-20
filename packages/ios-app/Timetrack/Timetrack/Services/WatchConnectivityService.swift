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
        WCSession.default.sendMessage(message, replyHandler: nil) { error in
            #if DEBUG
            print("WatchConnectivityService: Failed to send auth token to Watch: \(error)")
            #endif
        }
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
            print("WatchConnectivityService: activation failed: \(error)")
        }
        #endif
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
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
