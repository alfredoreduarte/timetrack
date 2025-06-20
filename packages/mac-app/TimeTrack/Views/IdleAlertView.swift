import SwiftUI

struct IdleAlertView: View {
    /// Closure called when the user dismisses the alert.
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("TimeTrack stopped after 10 minutes of not detecting any activity.")
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Dismiss") {
                onDismiss()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(minWidth: 340, minHeight: 120)
    }
}

#Preview {
    IdleAlertView(onDismiss: {})
        .frame(width: 340, height: 120)
        .preferredColorScheme(.dark)
}