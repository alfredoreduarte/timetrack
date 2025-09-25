import SwiftUI

struct LegalDocumentsView: View {
    @Environment(\.dismiss) var dismiss
    @State private var showingPrivacyPolicy = false
    @State private var showingTermsOfService = false
    
    var body: some View {
        NavigationView {
            List {
                Section {
                    Button(action: {
                        showingPrivacyPolicy = true
                    }) {
                        HStack {
                            Image(systemName: "lock.shield")
                                .foregroundColor(.blue)
                                .font(.title2)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Privacy Policy")
                                    .foregroundColor(.primary)
                                    .font(.headline)
                                
                                Text("How we collect, use, and protect your data")
                                    .foregroundColor(.secondary)
                                    .font(.caption)
                            }
                            
                            Spacer()
                            
                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }
                        .padding(.vertical, 4)
                    }
                    
                    Button(action: {
                        showingTermsOfService = true
                    }) {
                        HStack {
                            Image(systemName: "doc.text")
                                .foregroundColor(.blue)
                                .font(.title2)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Terms of Service")
                                    .foregroundColor(.primary)
                                    .font(.headline)
                                
                                Text("Rules and guidelines for using TimeTrack")
                                    .foregroundColor(.secondary)
                                    .font(.caption)
                            }
                            
                            Spacer()
                            
                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Legal Documents")
                } footer: {
                    Text("These documents explain your rights and our responsibilities when you use TimeTrack.")
                }
                
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("App Information")
                            .font(.headline)
                        
                        HStack {
                            Text("Version:")
                            Spacer()
                            Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Build:")
                            Spacer()
                            Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Last Updated:")
                            Spacer()
                            Text("January 2025")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                } header: {
                    Text("About")
                }
                
                Section {
                    Button(action: {
                        if let url = URL(string: "mailto:privacy@timetrack.app?subject=Privacy%20Question") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        HStack {
                            Image(systemName: "envelope")
                                .foregroundColor(.blue)
                            Text("Contact Privacy Team")
                                .foregroundColor(.primary)
                        }
                    }
                    
                    Button(action: {
                        if let url = URL(string: "mailto:support@timetrack.app?subject=Terms%20Question") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        HStack {
                            Image(systemName: "questionmark.circle")
                                .foregroundColor(.blue)
                            Text("Contact Support")
                                .foregroundColor(.primary)
                        }
                    }
                } header: {
                    Text("Questions?")
                } footer: {
                    Text("If you have questions about these documents or our policies, we're here to help.")
                }
            }
            .navigationTitle("Legal & Privacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
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