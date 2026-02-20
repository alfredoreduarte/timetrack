import AppIntents
import ActivityKit
import Security

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

    /// Read token from shared Keychain access group.
    /// NOTE: Service, account, and access group must match KeychainHelper.swift in the main app target.
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

    func perform() async throws -> some IntentResult {
        guard let token = getTokenFromKeychain() else {
            #if DEBUG
            print("StopTimerIntent: No auth token found in Keychain")
            #endif
            return .result()
        }

        // Read API URL from shared UserDefaults (non-sensitive, written by main app)
        let sharedDefaults = UserDefaults(suiteName: "group.com.timetrack.shared")
        let baseURL = sharedDefaults?.string(forKey: "timetrack_api_base_url")
            ?? "https://api.track.alfredo.re"
        guard let url = URL(string: "\(baseURL)/time-entries/\(entryId)/stop") else {
            #if DEBUG
            print("StopTimerIntent: Invalid URL for entryId: \(entryId)")
            #endif
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
                    await endActivity()
                }
            }
        } catch {
            #if DEBUG
            print("Failed to stop timer: \(error)")
            #endif
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
