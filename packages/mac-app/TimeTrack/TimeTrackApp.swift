import SwiftUI

@main
struct TimeTrackApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var timerViewModel = TimerViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(timerViewModel)
                .frame(minWidth: 600, minHeight: 500)
        }
        .windowResizability(.contentSize)
    }
}