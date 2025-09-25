import SwiftUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Privacy Policy")
                        .font(.title)
                        .fontWeight(.bold)
                        .padding(.horizontal)
                    
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Effective Date: January 2025")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        privacyPolicyContent
                    }
                    .padding(.horizontal)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
    
    private var privacyPolicyContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            policySection(title: "Introduction", content: "TimeTrack is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our TimeTrack mobile application and related services.")
            
            policySection(title: "Information We Collect", content: """
We collect the following types of information:

• Account Information: Name, email address, and password when you create an account
• Time Tracking Data: Projects, tasks, time entries, and duration records
• Usage Information: Features used, settings configured, and general usage patterns
• Device Information: Device type, operating system version, app version
""")
            
            policySection(title: "How We Use Your Information", content: """
We use your information to:

• Provide and maintain the TimeTrack service
• Create and manage your account
• Store and sync your time tracking data
• Send important service notifications
• Improve our app functionality and user experience
• Provide customer support
""")
            
            policySection(title: "Data Security", content: """
We implement strong security measures:

• All data transmission is encrypted using industry-standard protocols
• Passwords are hashed and salted before storage
• We implement regular security audits and updates
• Access to your data is restricted to authorized personnel only
""")
            
            policySection(title: "Your Rights", content: """
You have the right to:

• Access and update your account information at any time
• Delete your account and associated data
• Export your time tracking data
• Request correction of inaccurate information
• Opt out of promotional communications
""")
            
            policySection(title: "Data Retention", content: "We retain your account information while your account is active. You can request deletion of your data at any time through the app settings.")
            
            policySection(title: "Children's Privacy", content: "TimeTrack is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13.")
            
            policySection(title: "Changes to Privacy Policy", content: "We may update this Privacy Policy periodically. We will notify you of any material changes by posting the updated policy in the app and sending an email notification.")
            
            policySection(title: "Contact Us", content: """
If you have questions about this Privacy Policy, please contact us:

Email: privacy@timetrack.app
Website: https://timetrack.app/privacy

For California residents, you have additional rights under CCPA.
For EU residents, you have additional rights under GDPR.
""")
        }
    }
    
    private func policySection(title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .fontWeight(.semibold)
            
            Text(content)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    PrivacyPolicyView()
}