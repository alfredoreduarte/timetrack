import SwiftUI

struct CurrentStatusView: View {
    @EnvironmentObject var watchManager: WatchConnectivityManager
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if watchManager.isLoading {
                    ProgressView("Loading...")
                        .padding()
                } else {
                    // Timer Status Header
                    timerStatusHeader
                    
                    // Current Earnings Card
                    currentEarningsCard
                    
                    // Today's Summary Card
                    todaysSummaryCard
                    
                    // Timer Control Button
                    timerControlButton
                    
                    // Error message if any
                    if let errorMessage = watchManager.errorMessage {
                        Text(errorMessage)
                            .font(.caption2)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("TimeTrack")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            watchManager.refresh()
        }
    }
    
    // MARK: - Timer Status Header
    private var timerStatusHeader: some View {
        VStack(spacing: 4) {
            HStack {
                Circle()
                    .fill(watchManager.isTimerRunning ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                
                Text(watchManager.isTimerRunning ? "RUNNING" : "STOPPED")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(watchManager.isTimerRunning ? .green : .secondary)
            }
            
            Text(watchManager.currentProject)
                .font(.caption)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
    }
    
    // MARK: - Current Earnings Card
    private var currentEarningsCard: some View {
        VStack(spacing: 4) {
            Text("Current Earnings")
                .font(.caption2)
                .foregroundColor(.secondary)
            
            Text("$\(watchManager.currentEarnings, specifier: "%.2f")")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.primary)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.gray.opacity(0.2))
        }
    }
    
    // MARK: - Today's Summary Card
    private var todaysSummaryCard: some View {
        HStack(spacing: 16) {
            VStack(spacing: 2) {
                Text("Today")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                
                Text("\(watchManager.todaysHours, specifier: "%.1f")h")
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
            
            VStack(spacing: 2) {
                Text("This Week")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                
                Text("\(watchManager.todaysHours * 5, specifier: "%.1f")h")
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.gray.opacity(0.2))
        }
    }
    
    // MARK: - Timer Control Button
    private var timerControlButton: some View {
        Button(action: {
            if watchManager.isTimerRunning {
                watchManager.stopTimer()
            } else {
                // Navigate to project selection
                // This would typically show a project picker
            }
        }) {
            HStack {
                Image(systemName: watchManager.isTimerRunning ? "stop.fill" : "play.fill")
                    .font(.headline)
                
                Text(watchManager.isTimerRunning ? "Stop Timer" : "Start Timer")
                    .font(.headline)
                    .fontWeight(.semibold)
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: 8)
                    .fill(watchManager.isTimerRunning ? Color.red : Color.green)
            }
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    NavigationView {
        CurrentStatusView()
            .environmentObject(WatchConnectivityManager())
    }
}