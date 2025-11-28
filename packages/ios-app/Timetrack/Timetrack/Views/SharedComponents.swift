import SwiftUI

// MARK: - Shared UI Components

/// Shared project/task display component
struct ProjectTaskDisplayView: View {
    @EnvironmentObject var timerViewModel: TimerViewModel
    let entry: TimeEntry
    let style: DisplayStyle

    enum DisplayStyle {
        case full, compact
    }

    var body: some View {
        HStack(spacing: style == .compact ? AppTheme.spacingSM : AppTheme.spacingSM) {
            // Project color indicator
            Circle()
                .fill(timerViewModel.getProjectColor(for: entry))
                .frame(width: style == .compact ? 6 : 8, height: style == .compact ? 6 : 8)

            Text(timerViewModel.getProjectName(for: entry))
                .font(style == .compact ? .system(size: 13, weight: .semibold) : .system(size: 14, weight: .semibold))
                .foregroundColor(AppTheme.primary)
                .lineLimit(1)

            if let task = entry.task {
                Text(task.name)
                    .font(style == .compact ? .system(size: 12, weight: .medium) : .system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.tertiary)
                    .lineLimit(1)
            }
        }
    }
}

/// Compact earnings display
struct CompactEarningsView: View {
    let earnings: DashboardEarnings?
    let showCurrentTimer: Bool
    let currentTimerEarnings: Double?

    var body: some View {
        VStack(spacing: AppTheme.spacingSM) {
            // Show live current timer earnings if timer is running
            if showCurrentTimer, let liveEarnings = currentTimerEarnings {
                CompactEarningsRow(
                    label: "Current Timer",
                    value: String(format: "$%.2f", liveEarnings),
                    valueColor: AppTheme.earnings,
                    isHighlighted: true
                )
            }

            if let earnings = earnings {
                CompactEarningsRow(
                    label: "Today",
                    value: String(format: "$%.2f", earnings.today.earnings)
                )

                CompactEarningsRow(
                    label: "This Week",
                    value: String(format: "$%.2f", earnings.thisWeek.earnings)
                )
            } else {
                Text("Unable to load earnings")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.tertiary)
            }
        }
    }
}

/// Single earnings row for compact display
struct CompactEarningsRow: View {
    let label: String
    let value: String
    var valueColor: Color = AppTheme.primary
    var isHighlighted: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: isHighlighted ? .medium : .regular))
                .foregroundColor(isHighlighted ? AppTheme.primary : AppTheme.secondary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(valueColor)
        }
    }
}

// MARK: - Premium Button Styles

/// Primary gradient button style
struct PremiumPrimaryButtonStyle: ButtonStyle {
    var gradient: LinearGradient = AppTheme.accentGradient

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.spacingMD)
            .background(gradient)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .shadow(color: AppTheme.accent.opacity(0.3), radius: 8, x: 0, y: 4)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
    }
}

/// Secondary outline button style
struct PremiumSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.accent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.spacingMD)
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .stroke(AppTheme.accent.opacity(0.5), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.9 : 1.0)
    }
}

// MARK: - Premium Input Components

/// Premium styled text field with floating label support
struct PremiumInputField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var errorMessage: String? = nil
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.spacingSM) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.primary)

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                        .focused($isFocused)
                } else {
                    TextField(placeholder, text: $text)
                        .focused($isFocused)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppTheme.primary)
            .padding(AppTheme.spacingMD)
            .background(AppTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusSM))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.radiusSM)
                    .stroke(errorMessage != nil ? AppTheme.error : (isFocused ? AppTheme.accent.opacity(0.5) : AppTheme.border), lineWidth: 1)
            )

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppTheme.error)
            }
        }
    }
}

// MARK: - Status Indicators

/// Animated live status indicator (pulsing dot only)
struct LiveIndicator: View {
    @State private var isAnimating = false

    var body: some View {
        Circle()
            .fill(AppTheme.success)
            .frame(width: 8, height: 8)
            .opacity(isAnimating ? 0.4 : 1.0)
            .onAppear {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    isAnimating = true
                }
            }
    }
}

/// Loading spinner with optional label
struct PremiumLoadingView: View {
    var label: String? = nil

    var body: some View {
        HStack(spacing: AppTheme.spacingSM) {
            ProgressView()
                .scaleEffect(0.8)
                .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.accent))

            if let label = label {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.secondary)
            }
        }
    }
}

// MARK: - Cards and Containers

/// Premium card container with optional glow effect
struct PremiumCard<Content: View>: View {
    var hasGlow: Bool = false
    var glowColor: Color = AppTheme.accent
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            if hasGlow {
                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                    .fill(glowColor.opacity(0.05))
                    .blur(radius: 15)
                    .padding(-5)
            }

            content()
                .padding(AppTheme.spacingLG)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                        .stroke(hasGlow ? glowColor.opacity(0.3) : AppTheme.border, lineWidth: 1)
                )
        }
    }
}

// MARK: - Empty States

/// Premium empty state view
struct PremiumEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: AppTheme.spacingMD) {
            Image(systemName: icon)
                .font(.system(size: 36, weight: .light))
                .foregroundColor(AppTheme.tertiary)

            Text(title)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(AppTheme.primary)

            Text(subtitle)
                .font(.system(size: 13))
                .foregroundColor(AppTheme.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.spacing2XL)
    }
}
