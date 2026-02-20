import AppIntents
import ActivityKit

struct StopTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Timer"
    static var description = IntentDescription("Stops the currently running timer")

    @Parameter(title: "Entry ID")
    var entryId: String

    init() {
        self.entryId = ""
    }

    init(entryId: String) {
        self.entryId = entryId
    }

    func perform() async throws -> some IntentResult {
        // Get auth token from shared UserDefaults
        let sharedDefaults = UserDefaults(suiteName: "group.com.timetrack.shared")
        guard let token = sharedDefaults?.string(forKey: "timetrack_auth_token") else {
            print("❌ StopTimerIntent: No auth token found in shared storage")
            return .result()
        }

        // Read API URL from shared UserDefaults (written by main app's APIClient)
        let baseURL = sharedDefaults?.string(forKey: "timetrack_api_base_url")
            ?? "https://api.track.alfredo.re"
        guard let url = URL(string: "\(baseURL)/time-entries/\(entryId)/stop") else {
            print("❌ StopTimerIntent: Invalid URL for entryId: \(entryId)")
            return .result()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 {
                    await endActivity()
                } else if httpResponse.statusCode == 401 {
                    // Token expired — end the orphaned Live Activity
                    print("⚠️ StopTimerIntent: Auth token expired (401), ending activity")
                    await endActivity()
                }
            }
        } catch {
            print("Failed to stop timer: \(error)")
        }

        return .result()
    }

    private func endActivity() async {
        for activity in Activity<TimerActivityAttributes>.activities {
            if activity.attributes.entryId == entryId {
                let finalState = TimerActivityAttributes.ContentState(
                    elapsedSeconds: activity.content.state.elapsedSeconds,
                    isRunning: false
                )
                await activity.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
                break
            }
        }
    }
}
