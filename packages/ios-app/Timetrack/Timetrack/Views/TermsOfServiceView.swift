import SwiftUI

struct TermsOfServiceView: View {
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Terms of Service")
                        .font(.title)
                        .fontWeight(.bold)
                        .padding(.horizontal)
                    
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Effective Date: January 2025")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        termsContent
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
    
    private var termsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            termsSection(title: "Agreement to Terms", content: "By downloading, installing, or using the TimeTrack mobile application, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access or use our service.")
            
            termsSection(title: "Description of Service", content: """
TimeTrack is a time tracking application that allows users to:

• Track time spent on projects and tasks
• Manage project and task information
• Generate time and earnings reports
• Sync data across devices
""")
            
            termsSection(title: "User Accounts", content: """
Account Requirements:

• You must provide accurate and complete information when creating an account
• You are responsible for maintaining the security of your account credentials
• You must be at least 13 years of age to create an account
• You are solely responsible for all activities that occur under your account
""")
            
            termsSection(title: "Acceptable Use", content: """
You may use TimeTrack for legitimate time tracking and project management purposes.

You may NOT:
• Use the service for any illegal or unauthorized purpose
• Violate any laws in your jurisdiction
• Transmit harmful, threatening, or abusive content
• Attempt to reverse engineer or hack the application
• Interfere with or disrupt the service
""")
            
            termsSection(title: "Your Data", content: """
• You retain ownership of all time tracking data you input
• We will protect your data according to our Privacy Policy
• You are responsible for the accuracy of data you input
• You may export your data at any time
• We recommend regular review and backup of your data
""")
            
            termsSection(title: "Service Availability", content: """
• We strive to provide reliable service but cannot guarantee 100% uptime
• We may temporarily suspend service for maintenance or updates
• We may modify or discontinue features at any time
• We will provide reasonable notice of significant changes
""")
            
            termsSection(title: "Payment and Subscriptions", content: """
• Basic time tracking features are provided free of charge
• Premium features may require subscription payment
• All payments are processed securely through Apple App Store
• Refunds are subject to Apple App Store refund policies
""")
            
            termsSection(title: "Disclaimers", content: """
• TimeTrack is provided "as is" without warranties
• We do not guarantee error-free operation
• We are not responsible for data loss or corruption
• Time tracking accuracy depends on proper usage
• Users should verify important time data independently
""")
            
            termsSection(title: "Limitation of Liability", content: "To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid for services.")
            
            termsSection(title: "Termination", content: """
• You may terminate your account at any time
• We may terminate accounts for violation of these Terms
• Upon termination, you will lose access to the service
• Your data ownership rights are not affected by termination
""")
            
            termsSection(title: "Changes to Terms", content: "We may modify these Terms at any time. Material changes will be communicated through the app or email. Continued use after changes constitutes acceptance.")
            
            termsSection(title: "Contact Information", content: """
For questions about these Terms of Service, please contact us:

Email: support@timetrack.app
Website: https://timetrack.app/terms
""")
            
            Text("By using TimeTrack, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.")
                .font(.footnote)
                .foregroundColor(.secondary)
                .padding(.top)
        }
    }
    
    private func termsSection(title: String, content: String) -> some View {
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
    TermsOfServiceView()
}