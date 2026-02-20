import SwiftUI

struct AppTheme {
    // Core colors - Rich, premium dark palette
    static let primary = Color(hex: "#F8FAFC") ?? .white
    static let secondary = Color(hex: "#94A3B8") ?? .secondary
    static let tertiary = Color(hex: "#64748B") ?? .gray

    // Accent colors - Vibrant gradient-ready
    static let accent = Color(hex: "#6366F1") ?? .blue  // Indigo
    static let accentSecondary = Color(hex: "#8B5CF6") ?? .purple  // Violet

    // Backgrounds - Original dark palette
    static let background = Color(hex: "#161516") ?? .black
    static let backgroundElevated = Color(hex: "#1A1A1A") ?? .black
    static let cardBackground = Color(hex: "#1F1F1F") ?? .gray
    static let cardBackgroundHover = Color(hex: "#2A2A2A") ?? .gray

    // Semantic colors - Rich and bold
    static let success = Color(hex: "#22C55E") ?? .green
    static let successMuted = Color(hex: "#16A34A") ?? .green
    static let error = Color(hex: "#F43F5E") ?? .red  // Rose for premium feel
    static let errorMuted = Color(hex: "#E11D48") ?? .red
    static let warning = Color(hex: "#F59E0B") ?? .orange

    // Earnings highlight - Green for live money display
    static let earnings = Color(hex: "#22C55E") ?? .green
    static let earningsMuted = Color(hex: "#16A34A") ?? .green

    // Border colors
    static let border = Color(hex: "#27272A") ?? .gray
    static let borderSubtle = Color(hex: "#1F1F23") ?? .gray
    static let borderAccent = (Color(hex: "#6366F1") ?? .blue).opacity(0.3)

    // Gradients
    static let accentGradient = LinearGradient(
        colors: [Color(hex: "#6366F1") ?? .blue, Color(hex: "#8B5CF6") ?? .purple],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let successGradient = LinearGradient(
        colors: [Color(hex: "#22C55E") ?? .green, Color(hex: "#10B981") ?? .green],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let errorGradient = LinearGradient(
        colors: [Color(hex: "#F43F5E") ?? .red, Color(hex: "#E11D48") ?? .red],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardGradient = LinearGradient(
        colors: [Color(hex: "#18181B") ?? .gray, Color(hex: "#111113") ?? .black],
        startPoint: .top,
        endPoint: .bottom
    )

    // Typography weights
    static let fontWeightLight: Font.Weight = .light
    static let fontWeightRegular: Font.Weight = .regular
    static let fontWeightMedium: Font.Weight = .medium
    static let fontWeightSemibold: Font.Weight = .semibold
    static let fontWeightBold: Font.Weight = .bold

    // Spacing system
    static let spacingXS: CGFloat = 4
    static let spacingSM: CGFloat = 8
    static let spacingMD: CGFloat = 12
    static let spacingLG: CGFloat = 16
    static let spacingXL: CGFloat = 24
    static let spacing2XL: CGFloat = 32

    // Border radius
    static let radiusSM: CGFloat = 6
    static let radiusMD: CGFloat = 10
    static let radiusLG: CGFloat = 14
    static let radiusXL: CGFloat = 20
    static let radiusFull: CGFloat = 100
}
