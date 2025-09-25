import SwiftUI

struct RecentEntriesView: View {
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        NavigationView {
            ScrollView {
                LazyVStack(spacing: 6) {
                    if watchManager.recentEntries.isEmpty {
                        emptyStateView
                    } else {
                        ForEach(watchManager.recentEntries) { entry in
                            RecentEntryRowView(entry: entry)
                                .environmentObject(watchManager)
                        }
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("Recent")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 8) {
            Image(systemName: "clock")
                .font(.title2)
                .foregroundColor(.secondary)
            
            Text("No Recent Entries")
                .font(.footnote)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
            
            Text("Start a timer to see entries here")
                .font(.caption2)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 20)
    }
}

struct RecentEntryRowView: View {
    let entry: TimeEntry
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        Button(action: {
            watchManager.restartEntry(entry)
        }) {
            VStack(alignment: .leading, spacing: 4) {
                // Project and Task
                HStack {
                    Text(entry.projectName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    
                    Spacer()
                    
                    Image(systemName: "play.circle")
                        .font(.caption)
                        .foregroundColor(.green)
                }
                
                if let taskName = entry.taskName {
                    Text(taskName)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                // Duration and Earnings
                HStack {
                    Text(entry.formattedDuration)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    Text("$\(entry.earnings, specifier: "%.2f")")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundColor(.green)
                }
                
                // Relative Time
                HStack {
                    Text(entry.date, style: .relative)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(.systemGray6))
            }
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    RecentEntriesView()
        .environmentObject(WatchConnectivityManager())
}