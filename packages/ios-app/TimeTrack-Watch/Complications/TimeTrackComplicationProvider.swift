import ClockKit
import SwiftUI
import WidgetKit

struct TimeTrackComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimeTrackComplicationEntry {
        TimeTrackComplicationEntry(
            date: Date(),
            todaysEarnings: 247.50,
            todaysHours: 4.95,
            isTimerRunning: true,
            currentProject: "TimeTrack Dev"
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TimeTrackComplicationEntry) -> ()) {
        let entry = TimeTrackComplicationEntry(
            date: Date(),
            todaysEarnings: 247.50,
            todaysHours: 4.95,
            isTimerRunning: true,
            currentProject: "TimeTrack Dev"
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TimeTrackComplicationEntry>) -> ()) {
        // Generate timeline entries for the next hour
        var entries: [TimeTrackComplicationEntry] = []
        let currentDate = Date()
        
        // Create entries for next 4 quarters (1 hour total)
        for minuteOffset in stride(from: 0, to: 60, by: 15) {
            let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
            let entry = TimeTrackComplicationEntry(
                date: entryDate,
                todaysEarnings: 247.50 + Double(minuteOffset) * 0.5, // Mock increasing earnings
                todaysHours: 4.95 + Double(minuteOffset) / 60.0 * 0.25,
                isTimerRunning: true,
                currentProject: "TimeTrack Dev"
            )
            entries.append(entry)
        }

        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }
}

struct TimeTrackComplicationEntry: TimelineEntry {
    let date: Date
    let todaysEarnings: Double
    let todaysHours: Double
    let isTimerRunning: Bool
    let currentProject: String
}

// MARK: - Complication Views

struct TimeTrackComplicationEntryView: View {
    var entry: TimeTrackComplicationProvider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            circularComplication
        case .accessoryRectangular:
            rectangularComplication
        case .accessoryInline:
            inlineComplication
        default:
            Text("TimeTrack")
        }
    }
    
    // MARK: - Circular Complication (Watch Face Corner)
    private var circularComplication: some View {
        VStack(spacing: 2) {
            Image(systemName: entry.isTimerRunning ? "timer" : "clock")
                .font(.caption2)
                .foregroundColor(entry.isTimerRunning ? .green : .secondary)
            
            Text("$\(entry.todaysEarnings, specifier: "%.0f")")
                .font(.caption2)
                .fontWeight(.semibold)
                .minimumScaleFactor(0.6)
            
            Text("\(entry.todaysHours, specifier: "%.1f")h")
                .font(.caption2)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.6)
        }
    }
    
    // MARK: - Rectangular Complication (Smart Stack)
    private var rectangularComplication: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Circle()
                        .fill(entry.isTimerRunning ? Color.green : Color.gray)
                        .frame(width: 4, height: 4)
                    
                    Text(entry.isTimerRunning ? "RUNNING" : "STOPPED")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(entry.isTimerRunning ? .green : .secondary)
                }
                
                Text(entry.currentProject)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .lineLimit(1)
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 1) {
                Text("$\(entry.todaysEarnings, specifier: "%.2f")")
                    .font(.caption)
                    .fontWeight(.semibold)
                
                Text("\(entry.todaysHours, specifier: "%.1f") hours")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }
    
    // MARK: - Inline Complication (Watch Face Top)
    private var inlineComplication: some View {
        HStack {
            Image(systemName: entry.isTimerRunning ? "timer" : "clock")
                .foregroundColor(entry.isTimerRunning ? .green : .secondary)
            
            Text("$\(entry.todaysEarnings, specifier: "%.0f")")
                .fontWeight(.medium)
            
            Text("(\(entry.todaysHours, specifier: "%.1f")h)")
                .foregroundColor(.secondary)
        }
        .font(.caption)
    }
}

// MARK: - Widget Configuration
struct TimeTrackComplication: Widget {
    let kind: String = "TimeTrackComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TimeTrackComplicationProvider()) { entry in
            TimeTrackComplicationEntryView(entry: entry)
        }
        .configurationDisplayName("TimeTrack")
        .description("View your current earnings and timer status at a glance.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

#Preview("Circular", as: .accessoryCircular) {
    TimeTrackComplication()
} timeline: {
    TimeTrackComplicationEntry(
        date: Date(),
        todaysEarnings: 247.50,
        todaysHours: 4.95,
        isTimerRunning: true,
        currentProject: "TimeTrack Dev"
    )
}

#Preview("Rectangular", as: .accessoryRectangular) {
    TimeTrackComplication()
} timeline: {
    TimeTrackComplicationEntry(
        date: Date(),
        todaysEarnings: 247.50,
        todaysHours: 4.95,
        isTimerRunning: false,
        currentProject: "No Active Project"
    )
}