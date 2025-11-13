import SwiftUI

struct ContentView: View {
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        TabView {
            // Current Status View
            CurrentStatusView()
                .environmentObject(watchManager)
                .tabItem {
                    Image(systemName: "timer")
                    Text("Timer")
                }
            
            // Projects View
            ProjectsView()
                .environmentObject(watchManager)
                .tabItem {
                    Image(systemName: "folder")
                    Text("Projects")
                }
            
            // Recent Entries View
            RecentEntriesView()
                .environmentObject(watchManager)
                .tabItem {
                    Image(systemName: "clock")
                    Text("Recent")
                }
        }
        .tabViewStyle(PageTabViewStyle())
    }
}

#Preview {
    ContentView()
        .environmentObject(WatchConnectivityManager())
}
