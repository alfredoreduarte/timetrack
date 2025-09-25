# TimeTrack iOS Automated Testing Guide

## Setting Up Testing Environment

### XCTest Framework Setup
```swift
// TimeTrackTests/TimeTrackTests.swift
import XCTest
@testable import Timetrack

class TimeTrackTests: XCTestCase {
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        // Clear UserDefaults and reset state
        UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
    }
    
    override func tearDownWithError() throws {
        // Clean up after each test
    }
}
```

### UI Testing Setup
```swift
// TimeTrackUITests/TimeTrackUITests.swift
import XCTest

class TimeTrackUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
    }
}
```

## Unit Tests

### Authentication Tests
```swift
class AuthenticationTests: XCTestCase {
    
    func testValidEmailValidation() {
        let authService = AuthService()
        XCTAssertTrue(authService.isValidEmail("user@example.com"))
        XCTAssertTrue(authService.isValidEmail("test.email+tag@domain.co.uk"))
    }
    
    func testInvalidEmailValidation() {
        let authService = AuthService()
        XCTAssertFalse(authService.isValidEmail("invalid.email"))
        XCTAssertFalse(authService.isValidEmail("@domain.com"))
        XCTAssertFalse(authService.isValidEmail("user@"))
    }
    
    func testPasswordStrengthValidation() {
        let authService = AuthService()
        XCTAssertTrue(authService.isValidPassword("SecurePass123!"))
        XCTAssertFalse(authService.isValidPassword("weak"))
        XCTAssertFalse(authService.isValidPassword("password"))
    }
    
    func testLoginWithValidCredentials() async {
        let authService = AuthService()
        let expectation = expectation(description: "Login successful")
        
        do {
            let result = try await authService.login(email: "test@example.com", password: "validPassword")
            XCTAssertNotNil(result.token)
            expectation.fulfill()
        } catch {
            XCTFail("Login should succeed with valid credentials")
        }
        
        await fulfillment(of: [expectation], timeout: 5.0)
    }
}
```

### Time Tracking Tests
```swift
class TimeTrackingTests: XCTestCase {
    
    var timeTracker: TimeTracker!
    
    override func setUp() {
        timeTracker = TimeTracker()
    }
    
    func testStartTimer() {
        let project = Project(id: "1", name: "Test Project", color: .blue, hourlyRate: 50.0)
        
        timeTracker.startTimer(for: project)
        
        XCTAssertTrue(timeTracker.isTimerRunning)
        XCTAssertEqual(timeTracker.currentProject?.id, project.id)
        XCTAssertNotNil(timeTracker.startTime)
    }
    
    func testStopTimer() {
        let project = Project(id: "1", name: "Test Project", color: .blue, hourlyRate: 50.0)
        
        timeTracker.startTimer(for: project)
        Thread.sleep(forTimeInterval: 1.0) // Simulate some work time
        let entry = timeTracker.stopTimer()
        
        XCTAssertFalse(timeTracker.isTimerRunning)
        XCTAssertNil(timeTracker.currentProject)
        XCTAssertNotNil(entry)
        XCTAssertGreaterThan(entry!.duration, 0)
    }
    
    func testTimerDurationCalculation() {
        let startTime = Date()
        let endTime = startTime.addingTimeInterval(3600) // 1 hour
        
        let entry = TimeEntry(
            id: "1",
            projectId: "1",
            startTime: startTime,
            endTime: endTime,
            description: "Test"
        )
        
        XCTAssertEqual(entry.duration, 3600, accuracy: 1.0)
    }
}
```

### Project Management Tests
```swift
class ProjectManagementTests: XCTestCase {
    
    var projectManager: ProjectManager!
    
    override func setUp() {
        projectManager = ProjectManager()
    }
    
    func testCreateProject() {
        let project = Project(
            id: UUID().uuidString,
            name: "New Project",
            color: .green,
            hourlyRate: 75.0
        )
        
        projectManager.addProject(project)
        
        XCTAssertTrue(projectManager.projects.contains { $0.id == project.id })
    }
    
    func testUpdateProject() {
        var project = Project(
            id: "1",
            name: "Original Name",
            color: .blue,
            hourlyRate: 50.0
        )
        
        projectManager.addProject(project)
        project.name = "Updated Name"
        project.hourlyRate = 60.0
        
        projectManager.updateProject(project)
        
        let updatedProject = projectManager.project(withId: "1")
        XCTAssertEqual(updatedProject?.name, "Updated Name")
        XCTAssertEqual(updatedProject?.hourlyRate, 60.0)
    }
    
    func testDeleteProject() {
        let project = Project(
            id: "1",
            name: "Test Project",
            color: .red,
            hourlyRate: 25.0
        )
        
        projectManager.addProject(project)
        projectManager.deleteProject(withId: "1")
        
        XCTAssertFalse(projectManager.projects.contains { $0.id == "1" })
    }
}
```

### Report Generation Tests
```swift
class ReportGenerationTests: XCTestCase {
    
    var reportGenerator: ReportGenerator!
    var sampleEntries: [TimeEntry]!
    
    override func setUp() {
        reportGenerator = ReportGenerator()
        
        let now = Date()
        sampleEntries = [
            TimeEntry(id: "1", projectId: "1", startTime: now.addingTimeInterval(-7200), endTime: now.addingTimeInterval(-3600), description: "Work 1"),
            TimeEntry(id: "2", projectId: "1", startTime: now.addingTimeInterval(-3600), endTime: now, description: "Work 2"),
            TimeEntry(id: "3", projectId: "2", startTime: now.addingTimeInterval(-1800), endTime: now.addingTimeInterval(-900), description: "Work 3")
        ]
    }
    
    func testDailyReportGeneration() {
        let report = reportGenerator.generateDailyReport(for: Date(), entries: sampleEntries)
        
        XCTAssertEqual(report.totalHours, 2.25, accuracy: 0.01)
        XCTAssertEqual(report.entries.count, 3)
    }
    
    func testWeeklyReportGeneration() {
        let report = reportGenerator.generateWeeklyReport(for: Date(), entries: sampleEntries)
        
        XCTAssertNotNil(report)
        XCTAssertGreaterThan(report.totalHours, 0)
    }
    
    func testEarningsCalculation() {
        let project1 = Project(id: "1", name: "Project 1", color: .blue, hourlyRate: 50.0)
        let project2 = Project(id: "2", name: "Project 2", color: .green, hourlyRate: 75.0)
        let projects = [project1, project2]
        
        let earnings = reportGenerator.calculateEarnings(entries: sampleEntries, projects: projects)
        
        // 2 hours at $50 + 0.25 hours at $75 = $118.75
        XCTAssertEqual(earnings, 118.75, accuracy: 0.01)
    }
}
```

## UI Tests

### Authentication Flow Tests
```swift
class AuthenticationUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launch()
    }
    
    func testLoginFlow() {
        let emailTextField = app.textFields["Email"]
        let passwordSecureTextField = app.secureTextFields["Password"]
        let loginButton = app.buttons["Log In"]
        
        emailTextField.tap()
        emailTextField.typeText("test@example.com")
        
        passwordSecureTextField.tap()
        passwordSecureTextField.typeText("validPassword")
        
        loginButton.tap()
        
        // Verify navigation to main screen
        XCTAssertTrue(app.navigationBars["TimeTrack"].exists)
    }
    
    func testRegistrationFlow() {
        app.buttons["Sign Up"].tap()
        
        let nameTextField = app.textFields["Full Name"]
        let emailTextField = app.textFields["Email"]
        let passwordSecureTextField = app.secureTextFields["Password"]
        let confirmPasswordSecureTextField = app.secureTextFields["Confirm Password"]
        let signUpButton = app.buttons["Sign Up"]
        
        nameTextField.typeText("John Doe")
        emailTextField.typeText("john@example.com")
        passwordSecureTextField.typeText("SecurePass123!")
        confirmPasswordSecureTextField.typeText("SecurePass123!")
        
        signUpButton.tap()
        
        // Verify success or navigate to verification
        XCTAssertTrue(app.alerts.element.exists || app.navigationBars["TimeTrack"].exists)
    }
    
    func testPasswordResetFlow() {
        app.buttons["Forgot Password?"].tap()
        
        let emailTextField = app.textFields["Email"]
        let resetButton = app.buttons["Reset Password"]
        
        emailTextField.typeText("test@example.com")
        resetButton.tap()
        
        // Verify success message
        XCTAssertTrue(app.alerts["Reset Link Sent"].exists)
    }
}
```

### Timer UI Tests
```swift
class TimerUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--logged-in"]
        app.launch()
    }
    
    func testStartStopTimer() {
        let startButton = app.buttons["Start Timer"]
        let stopButton = app.buttons["Stop Timer"]
        let projectPicker = app.buttons["Select Project"]
        
        // Select a project
        projectPicker.tap()
        app.buttons["Test Project"].tap()
        
        // Start timer
        startButton.tap()
        
        XCTAssertTrue(stopButton.exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS '00:00:0'")).element.exists)
        
        // Wait a moment for timer to increment
        sleep(2)
        
        // Stop timer
        stopButton.tap()
        
        XCTAssertTrue(startButton.exists)
        XCTAssertFalse(stopButton.exists)
    }
    
    func testProjectSelection() {
        let projectPicker = app.buttons["Select Project"]
        
        projectPicker.tap()
        
        // Verify project list appears
        XCTAssertTrue(app.tables["ProjectList"].exists)
        
        // Select a project
        app.tables["ProjectList"].cells.element(boundBy: 0).tap()
        
        // Verify project is selected
        XCTAssertFalse(app.tables["ProjectList"].exists)
    }
}
```

### Project Management UI Tests
```swift
class ProjectManagementUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--logged-in"]
        app.launch()
        
        // Navigate to projects tab
        app.tabBars.buttons["Projects"].tap()
    }
    
    func testCreateProject() {
        let addButton = app.navigationBars.buttons["Add"]
        
        addButton.tap()
        
        let nameTextField = app.textFields["Project Name"]
        let hourlyRateTextField = app.textFields["Hourly Rate"]
        let saveButton = app.navigationBars.buttons["Save"]
        
        nameTextField.typeText("New Test Project")
        hourlyRateTextField.typeText("65.00")
        
        // Select a color
        app.buttons["ColorBlue"].tap()
        
        saveButton.tap()
        
        // Verify project appears in list
        XCTAssertTrue(app.tables.cells.containing(.staticText, identifier:"New Test Project").element.exists)
    }
    
    func testEditProject() {
        // Tap on existing project
        let projectCell = app.tables.cells.element(boundBy: 0)
        projectCell.tap()
        
        let editButton = app.navigationBars.buttons["Edit"]
        editButton.tap()
        
        let nameTextField = app.textFields["Project Name"]
        nameTextField.clearAndEnterText("Updated Project Name")
        
        let saveButton = app.navigationBars.buttons["Save"]
        saveButton.tap()
        
        // Verify updated name appears
        XCTAssertTrue(app.tables.cells.containing(.staticText, identifier:"Updated Project Name").element.exists)
    }
    
    func testDeleteProject() {
        let projectCell = app.tables.cells.element(boundBy: 0)
        
        // Swipe to delete
        projectCell.swipeLeft()
        app.buttons["Delete"].tap()
        
        // Confirm deletion
        app.alerts.buttons["Delete"].tap()
        
        // Verify project is removed (this test would need specific project data)
        // XCTAssertFalse(app.tables.cells.containing(.staticText, identifier:"Deleted Project").element.exists)
    }
}
```

### Apple Watch Integration Tests
```swift
class AppleWatchIntegrationTests: XCTestCase {
    
    func testWatchConnectivitySetup() {
        let connectivityManager = WatchConnectivityManager.shared
        
        XCTAssertTrue(WCSession.isSupported())
        XCTAssertEqual(connectivityManager.session.activationState, .activated)
    }
    
    func testDataSyncToWatch() {
        let connectivityManager = WatchConnectivityManager.shared
        let project = Project(id: "1", name: "Watch Test", color: .blue, hourlyRate: 50.0)
        
        connectivityManager.sendProject(project)
        
        // This would require Watch app testing or mock WCSession
        // In practice, you'd verify the message was sent correctly
    }
}
```

## Performance Tests

### Performance Testing Setup
```swift
class PerformanceTests: XCTestCase {
    
    func testAppLaunchPerformance() {
        if #available(macOS 10.15, iOS 13.0, tvOS 13.0, watchOS 7.0, *) {
            measure(metrics: [XCTApplicationLaunchMetric()]) {
                XCUIApplication().launch()
            }
        }
    }
    
    func testTimerAccuracy() {
        let timeTracker = TimeTracker()
        let project = Project(id: "1", name: "Test", color: .blue, hourlyRate: 50.0)
        
        let startTime = Date()
        timeTracker.startTimer(for: project)
        
        // Simulate precise timing
        Thread.sleep(forTimeInterval: 5.0)
        
        let entry = timeTracker.stopTimer()
        let expectedDuration: TimeInterval = 5.0
        
        XCTAssertEqual(entry!.duration, expectedDuration, accuracy: 0.1)
    }
    
    func testLargeDatasetPerformance() {
        let reportGenerator = ReportGenerator()
        var largeEntrySet: [TimeEntry] = []
        
        // Create 1000 time entries
        for i in 0..<1000 {
            let entry = TimeEntry(
                id: "\(i)",
                projectId: "\(i % 10)", // 10 different projects
                startTime: Date().addingTimeInterval(TimeInterval(-i * 3600)),
                endTime: Date().addingTimeInterval(TimeInterval(-i * 3600 + 1800)),
                description: "Entry \(i)"
            )
            largeEntrySet.append(entry)
        }
        
        measure {
            _ = reportGenerator.generateDailyReport(for: Date(), entries: largeEntrySet)
        }
    }
}
```

## Test Data Management

### Mock Data Setup
```swift
class MockDataManager {
    static let shared = MockDataManager()
    
    func createMockProjects() -> [Project] {
        return [
            Project(id: "1", name: "Client A", color: .blue, hourlyRate: 75.0),
            Project(id: "2", name: "Client B", color: .green, hourlyRate: 65.0),
            Project(id: "3", name: "Personal", color: .red, hourlyRate: 0.0)
        ]
    }
    
    func createMockTimeEntries() -> [TimeEntry] {
        let now = Date()
        return [
            TimeEntry(id: "1", projectId: "1", startTime: now.addingTimeInterval(-7200), endTime: now.addingTimeInterval(-5400), description: "Meeting"),
            TimeEntry(id: "2", projectId: "1", startTime: now.addingTimeInterval(-5400), endTime: now.addingTimeInterval(-3600), description: "Development"),
            TimeEntry(id: "3", projectId: "2", startTime: now.addingTimeInterval(-3600), endTime: now.addingTimeInterval(-1800), description: "Review")
        ]
    }
    
    func createMockUser() -> User {
        return User(id: "1", name: "Test User", email: "test@example.com")
    }
}
```

### Test Environment Configuration
```swift
extension XCUIApplication {
    func setupForTesting() {
        launchArguments += [
            "--uitesting",
            "--disable-animations",
            "--reset-data"
        ]
        
        launchEnvironment = [
            "API_BASE_URL": "https://test-api.timetrack.com",
            "DISABLE_NETWORK": "false"
        ]
    }
}

extension XCTestCase {
    func waitForElementToExist(_ element: XCUIElement, timeout: TimeInterval = 5.0) {
        let predicate = NSPredicate(format: "exists == true")
        expectation(for: predicate, evaluatedWith: element, handler: nil)
        waitForExpectations(timeout: timeout, handler: nil)
    }
}
```

## Running Tests

### Command Line Testing
```bash
# Run all tests
xcodebuild test -project Timetrack.xcodeproj -scheme Timetrack -destination 'platform=iOS Simulator,name=iPhone 14 Pro'

# Run specific test suite
xcodebuild test -project Timetrack.xcodeproj -scheme Timetrack -destination 'platform=iOS Simulator,name=iPhone 14 Pro' -only-testing:TimeTrackTests/AuthenticationTests

# Run UI tests only
xcodebuild test -project Timetrack.xcodeproj -scheme Timetrack -destination 'platform=iOS Simulator,name=iPhone 14 Pro' -only-testing:TimeTrackUITests

# Generate code coverage
xcodebuild test -project Timetrack.xcodeproj -scheme Timetrack -destination 'platform=iOS Simulator,name=iPhone 14 Pro' -enableCodeCoverage YES
```

### CI/CD Integration
```yaml
# .github/workflows/ios-tests.yml
name: iOS Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Select Xcode version
      run: sudo xcode-select -s /Applications/Xcode_15.0.app
    
    - name: Run tests
      run: |
        cd packages/ios-app/Timetrack
        xcodebuild test \
          -project Timetrack.xcodeproj \
          -scheme Timetrack \
          -destination 'platform=iOS Simulator,name=iPhone 14 Pro' \
          -enableCodeCoverage YES
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
```

## Test Coverage Goals

### Minimum Coverage Targets
- **Unit Tests**: 85% code coverage
- **Integration Tests**: 70% coverage of critical paths
- **UI Tests**: 60% coverage of main user flows
- **API Tests**: 95% coverage of all endpoints

### Critical Test Areas
1. **Authentication flow** - 100% coverage
2. **Timer functionality** - 95% coverage  
3. **Data persistence** - 90% coverage
4. **Report generation** - 85% coverage
5. **Project management** - 80% coverage

This comprehensive testing guide ensures TimeTrack iOS app maintains high quality and reliability before App Store submission.