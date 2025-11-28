import SwiftUI

struct IdleAlertView: View {
    let onDismiss: () -> Void

    @State private var isHovering = false

    var body: some View {
        VStack(spacing: AppTheme.spacingXL) {
            // Icon with warning styling
            ZStack {
                Circle()
                    .fill(AppTheme.warning.opacity(0.15))
                    .frame(width: 60, height: 60)
                    .blur(radius: 15)

                Image(systemName: "pause.circle.fill")
                    .font(.system(size: 40, weight: .light))
                    .foregroundColor(AppTheme.warning)
            }

            VStack(spacing: AppTheme.spacingSM) {
                Text("Timer Paused")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(AppTheme.primary)

                Text("TimeTrack stopped after detecting inactivity.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(AppTheme.secondary)
                    .multilineTextAlignment(.center)
            }

            Button(action: onDismiss) {
                Text("Dismiss")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, AppTheme.spacingXL)
                    .padding(.vertical, AppTheme.spacingMD)
                    .background(AppTheme.accentGradient)
                    .clipShape(Capsule())
                    .shadow(color: AppTheme.accent.opacity(0.3), radius: isHovering ? 10 : 6, x: 0, y: isHovering ? 4 : 2)
                    .scaleEffect(isHovering ? 1.03 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isHovering)
            }
            .buttonStyle(.plain)
            .onHover { hovering in
                isHovering = hovering
            }
        }
        .padding(AppTheme.spacingXL)
        .frame(minWidth: 320, minHeight: 200)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusLG))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.radiusLG)
                .stroke(AppTheme.border, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.3), radius: 20, x: 0, y: 10)
    }
}

#Preview {
    IdleAlertView(onDismiss: {})
        .frame(width: 360, height: 240)
        .background(AppTheme.background)
        .preferredColorScheme(.dark)
}
