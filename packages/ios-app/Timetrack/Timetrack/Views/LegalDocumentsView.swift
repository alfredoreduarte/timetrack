import SwiftUI

struct LegalDocumentsView: View {
    @Environment(\.dismiss) var dismiss
    @State private var showingPrivacyPolicy = false
    @State private var showingTermsOfService = false

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.spacingLG) {
                        // Legal Documents Section
                        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
                            Text("Legal Documents")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.secondary)
                                .textCase(.uppercase)

                            VStack(spacing: 0) {
                                Button(action: {
                                    showingPrivacyPolicy = true
                                }) {
                                    HStack(spacing: AppTheme.spacingMD) {
                                        Image(systemName: "lock.shield")
                                            .font(.system(size: 20))
                                            .foregroundColor(AppTheme.accent)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Privacy Policy")
                                                .font(.system(size: 14, weight: .medium))
                                                .foregroundColor(AppTheme.primary)

                                            Text("How we collect, use, and protect your data")
                                                .font(.system(size: 12))
                                                .foregroundColor(AppTheme.secondary)
                                        }

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(AppTheme.tertiary)
                                    }
                                    .padding(AppTheme.spacingMD)
                                }

                                Divider()
                                    .background(AppTheme.border)

                                Button(action: {
                                    showingTermsOfService = true
                                }) {
                                    HStack(spacing: AppTheme.spacingMD) {
                                        Image(systemName: "doc.text")
                                            .font(.system(size: 20))
                                            .foregroundColor(AppTheme.accent)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Terms of Service")
                                                .font(.system(size: 14, weight: .medium))
                                                .foregroundColor(AppTheme.primary)

                                            Text("Rules and guidelines for using TimeTrack")
                                                .font(.system(size: 12))
                                                .foregroundColor(AppTheme.secondary)
                                        }

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(AppTheme.tertiary)
                                    }
                                    .padding(AppTheme.spacingMD)
                                }
                            }
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                            .overlay(
                                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                                    .stroke(AppTheme.border, lineWidth: 1)
                            )

                            Text("These documents explain your rights and our responsibilities when you use TimeTrack.")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.tertiary)
                        }

                        // About Section
                        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
                            Text("About")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.secondary)
                                .textCase(.uppercase)

                            VStack(spacing: 0) {
                                HStack {
                                    Text("Version")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.primary)

                                    Spacer()

                                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                                        .font(.system(size: 14))
                                        .foregroundColor(AppTheme.secondary)
                                }
                                .padding(AppTheme.spacingMD)

                                Divider()
                                    .background(AppTheme.border)

                                HStack {
                                    Text("Build")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.primary)

                                    Spacer()

                                    Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                                        .font(.system(size: 14))
                                        .foregroundColor(AppTheme.secondary)
                                }
                                .padding(AppTheme.spacingMD)

                                Divider()
                                    .background(AppTheme.border)

                                HStack {
                                    Text("Last Updated")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(AppTheme.primary)

                                    Spacer()

                                    Text("January 2025")
                                        .font(.system(size: 14))
                                        .foregroundColor(AppTheme.secondary)
                                }
                                .padding(AppTheme.spacingMD)
                            }
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                            .overlay(
                                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                                    .stroke(AppTheme.border, lineWidth: 1)
                            )
                        }

                        // Contact Section
                        VStack(alignment: .leading, spacing: AppTheme.spacingMD) {
                            Text("Questions?")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.secondary)
                                .textCase(.uppercase)

                            VStack(spacing: 0) {
                                Button(action: {
                                    if let url = URL(string: "mailto:privacy@timetrack.app?subject=Privacy%20Question") {
                                        UIApplication.shared.open(url)
                                    }
                                }) {
                                    HStack(spacing: AppTheme.spacingMD) {
                                        Image(systemName: "envelope")
                                            .font(.system(size: 16))
                                            .foregroundColor(AppTheme.accent)

                                        Text("Contact Privacy Team")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(AppTheme.primary)

                                        Spacer()
                                    }
                                    .padding(AppTheme.spacingMD)
                                }

                                Divider()
                                    .background(AppTheme.border)

                                Button(action: {
                                    if let url = URL(string: "mailto:support@timetrack.app?subject=Terms%20Question") {
                                        UIApplication.shared.open(url)
                                    }
                                }) {
                                    HStack(spacing: AppTheme.spacingMD) {
                                        Image(systemName: "questionmark.circle")
                                            .font(.system(size: 16))
                                            .foregroundColor(AppTheme.accent)

                                        Text("Contact Support")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(AppTheme.primary)

                                        Spacer()
                                    }
                                    .padding(AppTheme.spacingMD)
                                }
                            }
                            .background(AppTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: AppTheme.radiusMD))
                            .overlay(
                                RoundedRectangle(cornerRadius: AppTheme.radiusMD)
                                    .stroke(AppTheme.border, lineWidth: 1)
                            )

                            Text("If you have questions about these documents or our policies, we're here to help.")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.tertiary)
                        }
                    }
                    .padding(AppTheme.spacingLG)
                }
                .navigationTitle("Legal & Privacy")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(AppTheme.accent)
                    }
                }
                .toolbarBackground(AppTheme.background, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .sheet(isPresented: $showingPrivacyPolicy) {
            PrivacyPolicyView()
        }
        .sheet(isPresented: $showingTermsOfService) {
            TermsOfServiceView()
        }
    }
}

// Extension to make this accessible from other views
extension LegalDocumentsView {
    static func presentAsSheet() -> some View {
        LegalDocumentsView()
    }
}

#Preview {
    LegalDocumentsView()
}
