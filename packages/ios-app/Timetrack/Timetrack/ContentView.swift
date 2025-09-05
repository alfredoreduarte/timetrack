//
//  ContentView.swift
//  Timetrack
//
//  Created by Alfredo Re on 2025-09-04.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var timerViewModel: TimerViewModel
    @State private var showingRegister = false

    var body: some View {
        Group {
            if authViewModel.isAuthenticated {
                DashboardView()
            } else {
                if showingRegister {
                    RegisterView(showingRegister: $showingRegister)
                } else {
                    LoginView(showingRegister: $showingRegister)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
        .preferredColorScheme(.dark)
}
