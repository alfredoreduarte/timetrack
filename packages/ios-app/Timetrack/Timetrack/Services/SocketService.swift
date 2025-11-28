import Foundation
import Combine
import SocketIO

@MainActor
class SocketService: ObservableObject {
    static let shared = SocketService()

    // MARK: - Published State
    @Published private(set) var connectionState: ConnectionState = .disconnected
    @Published private(set) var lastError: String?

    // MARK: - Event Publishers (Timer)
    let timerStartedSubject = PassthroughSubject<TimeEntry, Never>()
    let timerStoppedSubject = PassthroughSubject<TimeEntry, Never>()
    let entryCreatedSubject = PassthroughSubject<TimeEntry, Never>()
    let entryUpdatedSubject = PassthroughSubject<TimeEntry, Never>()
    let entryDeletedSubject = PassthroughSubject<String, Never>()

    // MARK: - Event Publishers (Projects)
    let projectCreatedSubject = PassthroughSubject<Project, Never>()
    let projectUpdatedSubject = PassthroughSubject<Project, Never>()
    let projectDeletedSubject = PassthroughSubject<String, Never>()

    // MARK: - Event Publishers (Tasks)
    let taskCreatedSubject = PassthroughSubject<TimeTrackTask, Never>()
    let taskUpdatedSubject = PassthroughSubject<TimeTrackTask, Never>()
    let taskDeletedSubject = PassthroughSubject<String, Never>()

    // MARK: - Private Properties
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var currentToken: String?
    private var reconnectAttempt = 0
    private var reconnectTask: Task<Void, Never>?

    // MARK: - Configuration
    private let baseURL: String
    private let maxReconnectAttempts = 10
    private let baseReconnectDelay: TimeInterval = 1.0
    private let maxReconnectDelay: TimeInterval = 30.0

    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case reconnecting
        case failed
    }

    private init() {
        // Match APIClient's URL resolution
        if let apiURL = ProcessInfo.processInfo.environment["TIMETRACK_API_URL"] {
            self.baseURL = apiURL
        } else {
            self.baseURL = "https://api.track.alfredo.re"
        }
    }

    // MARK: - Public Methods

    func connect(token: String) {
        guard connectionState != .connected && connectionState != .connecting else {
            print("🔌 Socket: Already connected or connecting")
            return
        }

        self.currentToken = token
        self.reconnectAttempt = 0
        connectionState = .connecting
        print("🔌 Socket: Connecting to \(baseURL)")
        setupSocket(token: token)
    }

    func disconnect() {
        print("🔌 Socket: Disconnecting")
        reconnectTask?.cancel()
        reconnectTask = nil
        socket?.disconnect()
        manager = nil
        socket = nil
        currentToken = nil
        connectionState = .disconnected
        lastError = nil
    }

    // MARK: - Private Setup

    private func setupSocket(token: String) {
        guard let url = URL(string: baseURL) else {
            print("❌ Socket: Invalid URL \(baseURL)")
            lastError = "Invalid server URL"
            return
        }

        // Socket.IO Swift client passes auth via extraHeaders for the handshake
        // The server middleware reads socket.handshake.auth.token
        let config: SocketIOClientConfiguration = [
            .log(false),
            .compress,
            .forceWebsockets(true),
            .reconnects(false), // We handle reconnection manually for backoff
            .extraHeaders(["Authorization": "Bearer \(token)"]),
            .version(.three) // Ensure we use Socket.IO v3 protocol
        ]

        manager = SocketManager(socketURL: url, config: config)

        // Configure the socket with auth data for handshake
        socket = manager?.defaultSocket
        socket?.connect(withPayload: ["token": token])

        setupEventHandlers(token: token)
    }

    private func setupEventHandlers(token: String) {
        // Connection lifecycle
        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            Task { @MainActor in
                self?.handleConnect()
            }
        }

        socket?.on(clientEvent: .disconnect) { [weak self] data, _ in
            Task { @MainActor in
                self?.handleDisconnect(reason: data.first as? String)
            }
        }

        socket?.on(clientEvent: .error) { [weak self] data, _ in
            Task { @MainActor in
                self?.handleError(data)
            }
        }

        // Timer events
        socket?.on("time-entry-started") { [weak self] data, _ in
            self?.handleTimeEntryEvent(data, subject: self?.timerStartedSubject, eventName: "started")
        }

        socket?.on("time-entry-stopped") { [weak self] data, _ in
            self?.handleTimeEntryEvent(data, subject: self?.timerStoppedSubject, eventName: "stopped")
        }

        socket?.on("time-entry-created") { [weak self] data, _ in
            self?.handleTimeEntryEvent(data, subject: self?.entryCreatedSubject, eventName: "created")
        }

        socket?.on("time-entry-updated") { [weak self] data, _ in
            self?.handleTimeEntryEvent(data, subject: self?.entryUpdatedSubject, eventName: "updated")
        }

        socket?.on("time-entry-deleted") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let id = dict["id"] as? String else { return }
            Task { @MainActor in
                print("📥 Socket: time-entry-deleted \(id)")
                self?.entryDeletedSubject.send(id)
            }
        }

        // Project events
        socket?.on("project-created") { [weak self] data, _ in
            self?.handleProjectEvent(data, subject: self?.projectCreatedSubject, eventName: "created")
        }

        socket?.on("project-updated") { [weak self] data, _ in
            self?.handleProjectEvent(data, subject: self?.projectUpdatedSubject, eventName: "updated")
        }

        socket?.on("project-deleted") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let id = dict["id"] as? String else { return }
            Task { @MainActor in
                print("📥 Socket: project-deleted \(id)")
                self?.projectDeletedSubject.send(id)
            }
        }

        // Task events
        socket?.on("task-created") { [weak self] data, _ in
            self?.handleTaskEvent(data, subject: self?.taskCreatedSubject, eventName: "created")
        }

        socket?.on("task-updated") { [weak self] data, _ in
            self?.handleTaskEvent(data, subject: self?.taskUpdatedSubject, eventName: "updated")
        }

        socket?.on("task-deleted") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let id = dict["id"] as? String else { return }
            Task { @MainActor in
                print("📥 Socket: task-deleted \(id)")
                self?.taskDeletedSubject.send(id)
            }
        }
    }

    private func handleConnect() {
        connectionState = .connected
        reconnectAttempt = 0
        lastError = nil
        print("✅ Socket: Connected")

        // Note: With JWT auth middleware, user auto-joins their room on server side
    }

    private func handleDisconnect(reason: String?) {
        print("⚠️ Socket: Disconnected (reason: \(reason ?? "unknown"))")
        guard connectionState != .disconnected else { return }

        // Don't reconnect if we explicitly disconnected
        if reason == "io client disconnect" {
            connectionState = .disconnected
            return
        }

        scheduleReconnect()
    }

    private func handleError(_ data: [Any]) {
        let errorMessage = (data.first as? String) ?? "Unknown error"
        print("❌ Socket error: \(errorMessage)")
        lastError = errorMessage

        // Check for auth errors
        if errorMessage.contains("token") || errorMessage.contains("Authentication") {
            // Auth failed, don't retry
            connectionState = .failed
            print("❌ Socket: Authentication failed, not retrying")
        }
    }

    private func handleTimeEntryEvent(_ data: [Any], subject: PassthroughSubject<TimeEntry, Never>?, eventName: String) {
        guard let dict = data.first as? [String: Any] else {
            print("❌ Socket: Failed to parse \(eventName) event data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let decoder = JSONDecoder()
            let entry = try decoder.decode(TimeEntry.self, from: jsonData)
            Task { @MainActor in
                print("📥 Socket: time-entry-\(eventName) for entry \(entry.id)")
                subject?.send(entry)
            }
        } catch {
            print("❌ Socket: Failed to decode TimeEntry: \(error)")
        }
    }

    private func handleProjectEvent(_ data: [Any], subject: PassthroughSubject<Project, Never>?, eventName: String) {
        guard let dict = data.first as? [String: Any] else {
            print("❌ Socket: Failed to parse project-\(eventName) event data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let decoder = JSONDecoder()
            let project = try decoder.decode(Project.self, from: jsonData)
            Task { @MainActor in
                print("📥 Socket: project-\(eventName) for project \(project.id)")
                subject?.send(project)
            }
        } catch {
            print("❌ Socket: Failed to decode Project: \(error)")
        }
    }

    private func handleTaskEvent(_ data: [Any], subject: PassthroughSubject<TimeTrackTask, Never>?, eventName: String) {
        guard let dict = data.first as? [String: Any] else {
            print("❌ Socket: Failed to parse task-\(eventName) event data")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict)
            let decoder = JSONDecoder()
            let task = try decoder.decode(TimeTrackTask.self, from: jsonData)
            Task { @MainActor in
                print("📥 Socket: task-\(eventName) for task \(task.id)")
                subject?.send(task)
            }
        } catch {
            print("❌ Socket: Failed to decode Task: \(error)")
        }
    }

    // MARK: - Reconnection with Exponential Backoff

    private func scheduleReconnect() {
        guard let token = currentToken else {
            print("❌ Socket: No token for reconnection")
            connectionState = .failed
            return
        }

        guard reconnectAttempt < maxReconnectAttempts else {
            print("❌ Socket: Max reconnection attempts reached, switching to polling fallback")
            connectionState = .failed
            return
        }

        connectionState = .reconnecting
        reconnectAttempt += 1

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
        let delay = min(
            baseReconnectDelay * pow(2.0, Double(reconnectAttempt - 1)),
            maxReconnectDelay
        )

        print("🔄 Socket: Reconnection attempt \(reconnectAttempt)/\(maxReconnectAttempts) in \(delay)s")

        reconnectTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }

            await MainActor.run {
                // Recreate socket with fresh connection
                self.setupSocket(token: token)
            }
        }
    }
}
