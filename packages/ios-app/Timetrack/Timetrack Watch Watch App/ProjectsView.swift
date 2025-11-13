import SwiftUI

struct ProjectsView: View {
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        NavigationView {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(watchManager.projects) { project in
                        ProjectRowView(project: project)
                            .environmentObject(watchManager)
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("Projects")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct ProjectRowView: View {
    let project: WatchProject
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        Button(action: {
            watchManager.startTimer(for: project)
        }) {
            HStack {
                // Project color indicator
                RoundedRectangle(cornerRadius: 2)
                    .fill(project.swiftUIColor)
                    .frame(width: 4, height: 20)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name)
                        .font(.footnote)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    
                    Text("Tap to start timer")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if watchManager.currentProject == project.name && watchManager.isTimerRunning {
                    Image(systemName: "timer")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.gray.opacity(0.2))
            }
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    ProjectsView()
        .environmentObject(WatchConnectivityManager())
}