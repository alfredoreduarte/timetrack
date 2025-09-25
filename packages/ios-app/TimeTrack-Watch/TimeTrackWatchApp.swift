import SwiftUI
import WatchKit

@main
struct TimeTrackWatchApp: App {
    @StateObject private var watchConnectivity = WatchConnectivityManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(watchConnectivity)
        }
    }
}

// MARK: - Watch Connectivity Manager
class WatchConnectivityManager: NSObject, ObservableObject {
    @Published var currentEarnings: Double = 0.0
    @Published var isTimerRunning = false
    @Published var currentProject: String = "No Active Project"
    @Published var todaysHours: Double = 0.0
    @Published var recentEntries: [TimeEntry] = []
    @Published var projects: [Project] = []
    
    override init() {
        super.init()
        // In a real implementation, set up WCSession for iPhone communication
        setupMockData()
    }
    
    private func setupMockData() {
        // Mock data for development - replace with real WCSession data
        currentEarnings = 247.50
        todaysHours = 4.95
        currentProject = "TimeTrack Development"
        isTimerRunning = true
        
        recentEntries = [
            TimeEntry(id: "1", projectName: "TimeTrack Development", taskName: "Watch App", duration: 3600, hourlyRate: 50.0, date: Date()),
            TimeEntry(id: "2", projectName: "Client Website", taskName: "Design Review", duration: 1800, hourlyRate: 75.0, date: Date().addingTimeInterval(-3600)),
            TimeEntry(id: "3", projectName: "Mobile App", taskName: "Bug Fixes", duration: 2700, hourlyRate: 60.0, date: Date().addingTimeInterval(-7200))
        ]
        
        projects = [
            Project(id: "1", name: "TimeTrack Development", color: "#3B82F6"),
            Project(id: "2", name: "Client Website", color: "#10B981"),
            Project(id: "3", name: "Mobile App", color: "#F59E0B"),
            Project(id: "4", name: "Consulting", color: "#EF4444")
        ]
    }
    
    func startTimer(for project: Project) {
        // Send start timer command to iPhone app
        currentProject = project.name
        isTimerRunning = true
    }
    
    func stopTimer() {
        // Send stop timer command to iPhone app
        isTimerRunning = false
        currentProject = "No Active Project"
    }
    
    func restartEntry(_ entry: TimeEntry) {
        // Send restart command to iPhone app
        currentProject = entry.projectName
        isTimerRunning = true
    }
}

// MARK: - Supporting Models
struct TimeEntry: Identifiable {
    let id: String
    let projectName: String
    let taskName: String?
    let duration: TimeInterval // in seconds
    let hourlyRate: Double
    let date: Date
    
    var earnings: Double {
        return (duration / 3600) * hourlyRate
    }
    
    var formattedDuration: String {
        let hours = Int(duration) / 3600
        let minutes = (Int(duration) % 3600) / 60
        
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }
}

struct Project: Identifiable {
    let id: String
    let name: String
    let color: String
    
    var swiftUIColor: Color {
        Color(hex: color) ?? .blue
    }
}

// MARK: - Color Extension
extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}