//
//  TimetrackApp.swift
//  Timetrack
//
//  Created by Alfredo Re on 2025-09-04.
//

import SwiftUI

@main
struct TimetrackApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    @StateObject private var timerViewModel = TimerViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(timerViewModel)
        }
    }
}
