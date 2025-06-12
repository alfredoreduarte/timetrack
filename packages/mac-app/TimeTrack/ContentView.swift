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
        .frame(minWidth: 600, minHeight: 500)
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthViewModel())
        .environmentObject(TimerViewModel())
}
