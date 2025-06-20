import AppKit
import Foundation

/// Monitors system-wide user activity (keyboard and mouse).
/// Triggers a callback when the user has been idle for the specified threshold.
final class IdleMonitor {
    /// Number of seconds the user must be inactive before `onIdle` is fired.
    private let idleThreshold: TimeInterval

    /// Callback executed on the main thread when the user crosses the idle threshold.
    var onIdle: (() -> Void)?

    /// The last time an input event (mouse / keyboard) was detected.
    private var lastInputDate: Date = Date()

    /// Keeps strong references to the installed global event monitors so they can be removed later.
    private var eventMonitors: [Any] = []

    /// Timer used to periodically evaluate the idle state.
    private var evaluationTimer: Timer?

    /// Tracks whether the idle callback has already been fired for the current idle session to avoid duplicates.
    private var hasReportedIdle = false

    init(threshold: TimeInterval = 10) {
        self.idleThreshold = threshold
        setupEventMonitoring()
        startEvaluationTimer()
    }

    deinit {
        stopEvaluationTimer()
        tearDownEventMonitoring()
    }

    // MARK: - Private helpers

    private func setupEventMonitoring() {
        // Monitor only mouse events to avoid requiring Input Monitoring permission
        let masks: [NSEvent.EventTypeMask] = [
            .mouseMoved,
            .leftMouseDown,
            .rightMouseDown,
            .otherMouseDown,
            .scrollWheel
        ]

        for mask in masks {
            if let monitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { [weak self] _ in
                guard let self = self else { return }
                self.lastInputDate = Date()
                self.hasReportedIdle = false // reset idle flag on any activity
            }) {
                eventMonitors.append(monitor)
            }
        }
    }

    private func tearDownEventMonitoring() {
        for monitor in eventMonitors {
            NSEvent.removeMonitor(monitor)
        }
        eventMonitors.removeAll()
    }

    private func startEvaluationTimer() {
        evaluationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.evaluateIdleState()
        }
        RunLoop.main.add(evaluationTimer!, forMode: .common)
    }

    private func stopEvaluationTimer() {
        evaluationTimer?.invalidate()
        evaluationTimer = nil
    }

    private func evaluateIdleState() {
        let idleDuration = Date().timeIntervalSince(lastInputDate)
        if idleDuration >= idleThreshold {
            guard !hasReportedIdle else { return }
            hasReportedIdle = true
            // Always call onIdle on the main thread to play nicely with SwiftUI / AppKit
            if let onIdle = onIdle {
                DispatchQueue.main.async { onIdle() }
            }
        }
    }
}