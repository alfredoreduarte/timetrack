import Foundation
import Combine

@MainActor
class PollingFallbackService: ObservableObject {
    static let shared = PollingFallbackService()

    @Published private(set) var isPolling = false

    private var pollingTask: Task<Void, Never>?
    private var currentInterval: TimeInterval = 5.0
    private let minInterval: TimeInterval = 5.0
    private let maxInterval: TimeInterval = 60.0

    private var cancellables = Set<AnyCancellable>()
    private let apiClient = APIClient.shared

    private init() {
        // Monitor socket connection state
        SocketService.shared.$connectionState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                Task { @MainActor in
                    self?.handleConnectionStateChange(state)
                }
            }
            .store(in: &cancellables)
    }

    private func handleConnectionStateChange(_ state: SocketService.ConnectionState) {
        switch state {
        case .connected:
            // Socket working, stop polling
            stopPolling()
            currentInterval = minInterval // Reset backoff

        case .failed:
            // Socket failed completely, start polling
            print("📡 Polling: Socket failed, starting fallback polling")
            startPolling()

        case .reconnecting:
            // Start polling during reconnection attempts
            if !isPolling {
                print("📡 Polling: Socket reconnecting, starting interim polling")
                startPolling()
            }

        default:
            break
        }
    }

    private func startPolling() {
        guard !isPolling else { return }
        isPolling = true

        pollingTask = Task {
            while !Task.isCancelled && isPolling {
                await performPoll()

                // Increase interval with backoff (slower growth than socket reconnect)
                currentInterval = min(currentInterval * 1.3, maxInterval)

                try? await Task.sleep(nanoseconds: UInt64(currentInterval * 1_000_000_000))
            }
        }
    }

    private func stopPolling() {
        guard isPolling else { return }
        print("📡 Polling: Stopping fallback polling")
        isPolling = false
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func performPoll() async {
        do {
            let currentEntry = try await apiClient.getCurrentEntry()

            // Post notification for TimerViewModel to handle
            NotificationCenter.default.post(
                name: .timerStatePollReceived,
                object: nil,
                userInfo: ["currentEntry": currentEntry as Any]
            )

            print("📡 Polling: Successfully fetched current entry state")

        } catch {
            print("📡 Polling: Error fetching state: \(error.localizedDescription)")
            // Increase backoff on error
            currentInterval = min(currentInterval * 2, maxInterval)
        }
    }
}
