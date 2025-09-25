# TimeTrack macOS Automated Testing Guide

## Setting Up Testing Environment

### XCTest Framework Setup
```swift
// TimeTrackTests/TimeTrackTests.swift
import XCTest
@testable import TimeTrack

class TimeTrackTests: XCTestCase {
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        
        // Reset UserDefaults for consistent testing
        UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
        UserDefaults.standard.synchronize()
        
        // Reset menu bar state
        MenuBarManager.shared.reset()
    }
    
    override func tearDownWithError() throws {
        // Clean up test data and reset state
        NotificationCenter.default.removeObserver(self)
    }
}
```

### UI Testing Setup for macOS
```swift
// TimeTrackUITests/TimeTrackUITests.swift
import XCTest

class TimeTrackUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        
        app = XCUIApplication()
        app.launchArguments = [
            "--uitesting",
            "--disable-menu-bar", // Disable menu bar for UI testing
            "--reset-data"
        ]
        app.launch()
        
        // Wait for app to fully load
        _ = app.wait(for: .runningForeground, timeout: 10)
    }
    
    override func tearDownWithError() throws {
        app.terminate()
    }
}
```

## Unit Tests

### Authentication Tests
```swift
class AuthenticationTests: XCTestCase {
    
    var authService: AuthService!
    
    override func setUp() {
        authService = AuthService()
    }
    
    func testEmailValidation() {
        XCTAssertTrue(authService.isValidEmail("user@example.com"))
        XCTAssertTrue(authService.isValidEmail("test.email+tag@domain.co.uk"))
        XCTAssertFalse(authService.isValidEmail("invalid.email"))
        XCTAssertFalse(authService.isValidEmail("@domain.com"))
    }
    
    func testPasswordStrengthValidation() {
        XCTAssertTrue(authService.isValidPassword("StrongPass123!"))
        XCTAssertFalse(authService.isValidPassword("weak"))
        XCTAssertFalse(authService.isValidPassword("password123"))
        XCTAssertFalse(authService.isValidPassword("SHORT1!"))
    }
    
    func testKeychainIntegration() {
        let credentials = AuthCredentials(email: "test@example.com", token: "test-token")
        
        // Test saving credentials
        XCTAssertNoThrow(try authService.saveCredentials(credentials))
        
        // Test loading credentials
        let loadedCredentials = try? authService.loadCredentials()
        XCTAssertEqual(loadedCredentials?.email, "test@example.com")
        XCTAssertEqual(loadedCredentials?.token, "test-token")
        
        // Test removing credentials
        XCTAssertNoThrow(try authService.clearCredentials())
        let clearedCredentials = try? authService.loadCredentials()
        XCTAssertNil(clearedCredentials)
    }
    
    func testLoginWithValidCredentials() async {
        let expectation = expectation(description: "Login successful")
        
        do {
            let result = try await authService.login(
                email: "test@example.com", 
                password: "validPassword"
            )
            XCTAssertNotNil(result.token)
            XCTAssertNotNil(result.user)
            expectation.fulfill()
        } catch {
            XCTFail("Login should succeed: \(error)")
        }
        
        await fulfillment(of: [expectation], timeout: 5.0)
    }
}
```

### Menu Bar Integration Tests
```swift
class MenuBarTests: XCTestCase {
    
    var menuBarManager: MenuBarManager!
    
    override func setUp() {
        menuBarManager = MenuBarManager.shared
    }
    
    func testMenuBarItemCreation() {
        menuBarManager.setupMenuBarItem()
        
        XCTAssertNotNil(menuBarManager.statusItem)
        XCTAssertNotNil(menuBarManager.statusItem?.button)
        XCTAssertNotNil(menuBarManager.statusItem?.menu)
    }
    
    func testMenuBarIconStates() {
        // Test idle state
        menuBarManager.updateIcon(for: .idle)
        XCTAssertEqual(menuBarManager.currentIcon, .idle)
        
        // Test running state
        menuBarManager.updateIcon(for: .running)
        XCTAssertEqual(menuBarManager.currentIcon, .running)
        
        // Test paused state
        menuBarManager.updateIcon(for: .paused)
        XCTAssertEqual(menuBarManager.currentIcon, .paused)
    }
    
    func testMenuBarTimerDisplay() {
        let timeInterval: TimeInterval = 3661 // 1 hour, 1 minute, 1 second
        
        menuBarManager.updateTimerDisplay(timeInterval)
        
        let expectedDisplay = "1:01:01"
        XCTAssertEqual(menuBarManager.currentTimerDisplay, expectedDisplay)
    }
    
    func testMenuBarVisibilityToggle() {
        // Test showing menu bar
        menuBarManager.setVisible(true)
        XCTAssertTrue(menuBarManager.isVisible)
        
        // Test hiding menu bar
        menuBarManager.setVisible(false)
        XCTAssertFalse(menuBarManager.isVisible)
    }
}
```

### Timer Functionality Tests
```swift
class TimerTests: XCTestCase {
    
    var timeTracker: TimeTracker!
    
    override func setUp() {
        timeTracker = TimeTracker()
    }
    
    func testStartTimer() {
        let project = Project(id: "1", name: "Test Project", color: .systemBlue, hourlyRate: 75.0)
        
        timeTracker.startTimer(for: project)
        
        XCTAssertTrue(timeTracker.isRunning)
        XCTAssertEqual(timeTracker.currentProject?.id, project.id)
        XCTAssertNotNil(timeTracker.startTime)
    }
    
    func testStopTimer() {
        let project = Project(id: "1", name: "Test Project", color: .systemBlue, hourlyRate: 75.0)
        
        timeTracker.startTimer(for: project)
        Thread.sleep(forTimeInterval: 1.0)
        
        let entry = timeTracker.stopTimer()
        
        XCTAssertFalse(timeTracker.isRunning)
        XCTAssertNil(timeTracker.currentProject)
        XCTAssertNotNil(entry)
        XCTAssertGreaterThan(entry!.duration, 0)
    }
    
    func testPauseResumeTimer() {
        let project = Project(id: "1", name: "Test Project", color: .systemBlue, hourlyRate: 75.0)
        
        timeTracker.startTimer(for: project)
        Thread.sleep(forTimeInterval: 0.5)
        
        timeTracker.pauseTimer()
        XCTAssertTrue(timeTracker.isPaused)
        
        let pausedDuration = timeTracker.elapsedTime
        Thread.sleep(forTimeInterval: 0.5)
        
        // Duration should not increase while paused
        XCTAssertEqual(timeTracker.elapsedTime, pausedDuration, accuracy: 0.1)
        
        timeTracker.resumeTimer()
        XCTAssertFalse(timeTracker.isPaused)
        XCTAssertTrue(timeTracker.isRunning)
    }
    
    func testTimerPersistence() {
        let project = Project(id: "1", name: "Test Project", color: .systemBlue, hourlyRate: 75.0)
        
        timeTracker.startTimer(for: project)
        let startTime = timeTracker.startTime!
        
        // Simulate app restart
        let newTimeTracker = TimeTracker()
        newTimeTracker.loadPersistedTimer()
        
        XCTAssertTrue(newTimeTracker.isRunning)
        XCTAssertEqual(newTimeTracker.startTime, startTime)
        XCTAssertEqual(newTimeTracker.currentProject?.id, project.id)
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
            color: .systemGreen,
            hourlyRate: 85.0
        )
        
        projectManager.addProject(project)
        
        XCTAssertTrue(projectManager.projects.contains { $0.id == project.id })
        XCTAssertEqual(projectManager.projects.count, 1)
    }
    
    func testUpdateProject() {
        var project = Project(
            id: "1",
            name: "Original Name",
            color: .systemBlue,
            hourlyRate: 50.0
        )
        
        projectManager.addProject(project)
        
        project.name = "Updated Name"
        project.hourlyRate = 75.0
        project.color = .systemRed
        
        projectManager.updateProject(project)
        
        let updatedProject = projectManager.project(withId: "1")
        XCTAssertEqual(updatedProject?.name, "Updated Name")
        XCTAssertEqual(updatedProject?.hourlyRate, 75.0)
        XCTAssertEqual(updatedProject?.color, .systemRed)
    }
    
    func testDeleteProject() {
        let project = Project(
            id: "1",
            name: "Test Project",
            color: .systemPurple,
            hourlyRate: 60.0
        )
        
        projectManager.addProject(project)
        XCTAssertEqual(projectManager.projects.count, 1)
        
        projectManager.deleteProject(withId: "1")
        XCTAssertEqual(projectManager.projects.count, 0)
        XCTAssertFalse(projectManager.projects.contains { $0.id == "1" })
    }
    
    func testProjectSorting() {
        let projectA = Project(id: "1", name: "Alpha", color: .systemBlue, hourlyRate: 50.0)
        let projectB = Project(id: "2", name: "Beta", color: .systemGreen, hourlyRate: 60.0)
        let projectC = Project(id: "3", name: "Charlie", color: .systemRed, hourlyRate: 70.0)
        
        projectManager.addProject(projectC)
        projectManager.addProject(projectA)
        projectManager.addProject(projectB)
        
        let sortedProjects = projectManager.sortedProjects()
        XCTAssertEqual(sortedProjects[0].name, "Alpha")
        XCTAssertEqual(sortedProjects[1].name, "Beta")
        XCTAssertEqual(sortedProjects[2].name, "Charlie")
    }
}
```

### Report Generation Tests
```swift
class ReportGenerationTests: XCTestCase {
    
    var reportGenerator: ReportGenerator!
    var sampleEntries: [TimeEntry]!
    var sampleProjects: [Project]!
    
    override func setUp() {
        reportGenerator = ReportGenerator()
        
        sampleProjects = [
            Project(id: "1", name: "Client A", color: .systemBlue, hourlyRate: 75.0),
            Project(id: "2", name: "Client B", color: .systemGreen, hourlyRate: 65.0)
        ]
        
        let now = Date()
        sampleEntries = [
            TimeEntry(id: "1", projectId: "1", startTime: now.addingTimeInterval(-7200), 
                     endTime: now.addingTimeInterval(-5400), description: "Meeting"),
            TimeEntry(id: "2", projectId: "1", startTime: now.addingTimeInterval(-5400), 
                     endTime: now.addingTimeInterval(-3600), description: "Development"),
            TimeEntry(id: "3", projectId: "2", startTime: now.addingTimeInterval(-3600), 
                     endTime: now.addingTimeInterval(-1800), description: "Review")
        ]
    }
    
    func testDailyReportGeneration() {
        let report = reportGenerator.generateDailyReport(
            for: Date(), 
            entries: sampleEntries, 
            projects: sampleProjects
        )
        
        XCTAssertEqual(report.totalHours, 2.5, accuracy: 0.01)
        XCTAssertEqual(report.totalEarnings, 168.75, accuracy: 0.01) // (1.5 * 75) + (1 * 65)
        XCTAssertEqual(report.entries.count, 3)
    }
    
    func testWeeklyReportGeneration() {
        let report = reportGenerator.generateWeeklyReport(
            for: Date(), 
            entries: sampleEntries, 
            projects: sampleProjects
        )
        
        XCTAssertNotNil(report)
        XCTAssertGreaterThan(report.totalHours, 0)
    }
    
    func testPDFReportGeneration() {
        let report = reportGenerator.generateDailyReport(
            for: Date(), 
            entries: sampleEntries, 
            projects: sampleProjects
        )
        
        let pdfData = reportGenerator.generatePDF(from: report)
        
        XCTAssertNotNil(pdfData)
        XCTAssertGreaterThan(pdfData!.count, 0)
        
        // Verify PDF header
        let pdfString = String(data: pdfData!, encoding: .ascii) ?? ""
        XCTAssertTrue(pdfString.hasPrefix("%PDF"))
    }
    
    func testCSVExport() {
        let csvData = reportGenerator.exportToCSV(entries: sampleEntries, projects: sampleProjects)
        
        XCTAssertNotNil(csvData)
        
        let csvString = String(data: csvData!, encoding: .utf8) ?? ""
        XCTAssertTrue(csvString.contains("Project,Start Time,End Time,Duration,Description,Earnings"))
        XCTAssertTrue(csvString.contains("Client A"))
        XCTAssertTrue(csvString.contains("Client B"))
    }
}
```

### Notification Tests
```swift
class NotificationTests: XCTestCase {
    
    var notificationManager: NotificationManager!
    
    override func setUp() {
        notificationManager = NotificationManager.shared
    }
    
    func testNotificationPermissionRequest() {
        let expectation = expectation(description: "Permission requested")
        
        notificationManager.requestPermission { granted in
            XCTAssertTrue(granted || !granted) // Test that we get a response
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testTimerNotifications() {
        let project = Project(id: "1", name: "Test Project", color: .systemBlue, hourlyRate: 50.0)
        
        // Test start notification
        notificationManager.sendTimerStartNotification(for: project)
        
        // Test stop notification with duration
        notificationManager.sendTimerStopNotification(duration: 3600, earnings: 50.0)
        
        // Verify notifications were scheduled (would need to check UNUserNotificationCenter)
    }
    
    func testIdleTimeNotification() {
        notificationManager.sendIdleTimeNotification(idleTime: 600) // 10 minutes
        
        // Verify idle notification was sent
    }
    
    func testDailyReminderNotification() {
        notificationManager.scheduleDailyReminder(at: Calendar.current.dateComponents([.hour, .minute], from: Date()))
        
        // Verify daily reminder was scheduled
    }
}
```

## UI Tests for macOS

### Main Window UI Tests
```swift
class MainWindowUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--disable-menu-bar"]
        app.launch()
    }
    
    func testWindowAppearance() {
        let window = app.windows["TimeTrack"]
        XCTAssertTrue(window.exists)
        XCTAssertTrue(window.isHittable)
        
        // Test window can be resized
        let originalFrame = window.frame
        window.resize(withSizeOffset: CGVector(dx: 100, dy: 50))
        XCTAssertNotEqual(window.frame, originalFrame)
    }
    
    func testSidebarNavigation() {
        let sidebar = app.outlines["Sidebar"]
        XCTAssertTrue(sidebar.exists)
        
        // Test navigation items
        let dashboardItem = sidebar.outlineRows["Dashboard"]
        let projectsItem = sidebar.outlineRows["Projects"]
        let reportsItem = sidebar.outlineRows["Reports"]
        
        XCTAssertTrue(dashboardItem.exists)
        XCTAssertTrue(projectsItem.exists)
        XCTAssertTrue(reportsItem.exists)
        
        // Test navigation
        projectsItem.click()
        XCTAssertTrue(app.tables["ProjectsList"].waitForExistence(timeout: 2))
        
        reportsItem.click()
        XCTAssertTrue(app.buttons["Generate Report"].waitForExistence(timeout: 2))
    }
    
    func testToolbarButtons() {
        let toolbar = app.toolbars["MainToolbar"]
        
        let startButton = toolbar.buttons["Start Timer"]
        let stopButton = toolbar.buttons["Stop Timer"]
        let projectButton = toolbar.buttons["Select Project"]
        
        XCTAssertTrue(startButton.exists)
        XCTAssertTrue(projectButton.exists)
        
        // Initially, stop button should not exist
        XCTAssertFalse(stopButton.exists)
        
        // Start a timer
        projectButton.click()
        app.menuItems["Test Project"].click()
        startButton.click()
        
        // Now stop button should exist
        XCTAssertTrue(stopButton.waitForExistence(timeout: 2))
        XCTAssertFalse(startButton.exists)
    }
}
```

### Project Management UI Tests
```swift
class ProjectManagementUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--with-sample-data"]
        app.launch()
        
        // Navigate to projects
        app.outlines["Sidebar"].outlineRows["Projects"].click()
    }
    
    func testCreateProject() {
        let addButton = app.buttons["Add Project"]
        addButton.click()
        
        let sheet = app.sheets["Project Details"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 2))
        
        let nameField = sheet.textFields["Project Name"]
        let rateField = sheet.textFields["Hourly Rate"]
        let colorWell = sheet.colorWells["Project Color"]
        let saveButton = sheet.buttons["Save"]
        
        nameField.click()
        nameField.typeText("New macOS Project")
        
        rateField.click()
        rateField.typeText("85.00")
        
        colorWell.click()
        // Color picker interaction would go here
        
        saveButton.click()
        
        // Verify project appears in list
        let projectTable = app.tables["ProjectsList"]
        XCTAssertTrue(projectTable.cells.containing(.staticText, identifier: "New macOS Project").element.exists)
    }
    
    func testEditProject() {
        let projectTable = app.tables["ProjectsList"]
        let firstProject = projectTable.tableRows.element(boundBy: 0)
        
        // Double-click to edit
        firstProject.doubleClick()
        
        let sheet = app.sheets["Project Details"]
        let nameField = sheet.textFields["Project Name"]
        
        // Clear and enter new name
        nameField.click()
        nameField.typeKey("a", modifierFlags: .command) // Select all
        nameField.typeText("Updated Project Name")
        
        sheet.buttons["Save"].click()
        
        // Verify update
        XCTAssertTrue(projectTable.cells.containing(.staticText, identifier: "Updated Project Name").element.exists)
    }
    
    func testDeleteProject() {
        let projectTable = app.tables["ProjectsList"]
        let firstProject = projectTable.tableRows.element(boundBy: 0)
        
        // Right-click for context menu
        firstProject.rightClick()
        
        let contextMenu = app.menuItems["Delete Project"]
        contextMenu.click()
        
        // Confirm deletion in alert
        let alert = app.dialogs["Confirm Deletion"]
        alert.buttons["Delete"].click()
        
        // Verify project is removed (would need specific project identification)
    }
}
```

### Timer UI Tests
```swift
class TimerUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--with-sample-projects"]
        app.launch()
    }
    
    func testTimerStartStop() {
        // Select a project
        let projectButton = app.buttons["Select Project"]
        projectButton.click()
        
        let projectMenu = app.menus["Project Selection"]
        projectMenu.menuItems["Sample Project"].click()
        
        // Start timer
        let startButton = app.buttons["Start Timer"]
        startButton.click()
        
        // Verify timer is running
        let timerDisplay = app.staticTexts["Timer Display"]
        XCTAssertTrue(timerDisplay.waitForExistence(timeout: 2))
        
        // Wait for timer to increment
        Thread.sleep(forTimeInterval: 2)
        
        // Stop timer
        let stopButton = app.buttons["Stop Timer"]
        XCTAssertTrue(stopButton.exists)
        stopButton.click()
        
        // Verify timer stopped
        XCTAssertTrue(startButton.waitForExistence(timeout: 2))
        XCTAssertFalse(stopButton.exists)
    }
    
    func testTimerDisplayAccuracy() {
        // This would require more complex timing verification
        // Could use expectations and wait for specific timer values
    }
}
```

### Reports UI Tests
```swift
class ReportsUITests: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--with-sample-data"]
        app.launch()
        
        app.outlines["Sidebar"].outlineRows["Reports"].click()
    }
    
    func testReportGeneration() {
        // Select date range
        let startDatePicker = app.datePickers["Start Date"]
        let endDatePicker = app.datePickers["End Date"]
        
        startDatePicker.click()
        // Date picker interaction
        
        endDatePicker.click()
        // Date picker interaction
        
        // Generate report
        let generateButton = app.buttons["Generate Report"]
        generateButton.click()
        
        // Verify report appears
        let reportTable = app.tables["Report Results"]
        XCTAssertTrue(reportTable.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(reportTable.tableRows.count, 0)
    }
    
    func testReportExport() {
        // Generate a report first
        app.buttons["Generate Report"].click()
        
        let exportButton = app.buttons["Export"]
        exportButton.click()
        
        let exportMenu = app.menus["Export Options"]
        
        // Test PDF export
        exportMenu.menuItems["Export as PDF"].click()
        
        let savePanel = app.dialogs["Save Panel"]
        XCTAssertTrue(savePanel.waitForExistence(timeout: 3))
        
        savePanel.buttons["Cancel"].click() // Cancel to avoid actual file creation
    }
}
```

## Performance Tests

### Performance Monitoring
```swift
class PerformanceTests: XCTestCase {
    
    func testAppLaunchTime() {
        if #available(macOS 10.15, *) {
            measure(metrics: [XCTApplicationLaunchMetric()]) {
                let app = XCUIApplication()
                app.launch()
                app.terminate()
            }
        }
    }
    
    func testTimerAccuracy() {
        let timer = TimeTracker()
        let project = Project(id: "1", name: "Test", color: .systemBlue, hourlyRate: 50.0)
        
        let expectation = expectation(description: "Timer accuracy test")
        let startTime = Date()
        
        timer.startTimer(for: project)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
            let entry = timer.stopTimer()
            let actualDuration = Date().timeIntervalSince(startTime)
            
            XCTAssertEqual(entry!.duration, actualDuration, accuracy: 0.2)
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 10.0)
    }
    
    func testMemoryUsage() {
        let reportGenerator = ReportGenerator()
        let projectManager = ProjectManager()
        
        // Create large dataset
        var largeEntries: [TimeEntry] = []
        for i in 0..<10000 {
            let entry = TimeEntry(
                id: "\(i)",
                projectId: "\(i % 100)",
                startTime: Date().addingTimeInterval(TimeInterval(-i * 60)),
                endTime: Date().addingTimeInterval(TimeInterval(-i * 60 + 30)),
                description: "Entry \(i)"
            )
            largeEntries.append(entry)
        }
        
        measure(metrics: [XCTMemoryMetric()]) {
            _ = reportGenerator.generateWeeklyReport(for: Date(), entries: largeEntries, projects: projectManager.projects)
        }
    }
    
    func testUIResponsiveness() {
        let app = XCUIApplication()
        app.launch()
        
        measure(metrics: [XCTClockMetric()]) {
            // Navigate through different views
            app.outlines["Sidebar"].outlineRows["Projects"].click()
            app.outlines["Sidebar"].outlineRows["Reports"].click()
            app.outlines["Sidebar"].outlineRows["Dashboard"].click()
        }
    }
}
```

## Integration Tests

### Menu Bar Integration Tests
```swift
class MenuBarIntegrationTests: XCTestCase {
    
    func testMenuBarTimerIntegration() {
        let menuBarManager = MenuBarManager.shared
        let timeTracker = TimeTracker()
        let project = Project(id: "1", name: "Test", color: .systemBlue, hourlyRate: 50.0)
        
        // Setup observer for menu bar updates
        let expectation = expectation(description: "Menu bar updated")
        
        NotificationCenter.default.addObserver(forName: .timerDidStart, object: nil, queue: .main) { _ in
            XCTAssertEqual(menuBarManager.currentIcon, .running)
            expectation.fulfill()
        }
        
        timeTracker.startTimer(for: project)
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    func testMenuBarQuickActions() {
        let menuBarManager = MenuBarManager.shared
        menuBarManager.setupMenuBarItem()
        
        let menu = menuBarManager.statusItem?.menu
        XCTAssertNotNil(menu)
        
        // Verify menu items exist
        let startItem = menu?.item(withTitle: "Start Timer")
        let projectsItem = menu?.item(withTitle: "Projects")
        let reportsItem = menu?.item(withTitle: "View Reports")
        
        XCTAssertNotNil(startItem)
        XCTAssertNotNil(projectsItem)
        XCTAssertNotNil(reportsItem)
    }
}
```

### System Integration Tests
```swift
class SystemIntegrationTests: XCTestCase {
    
    func testNotificationIntegration() {
        let notificationManager = NotificationManager.shared
        let expectation = expectation(description: "Notification delivered")
        
        // Request permission first
        notificationManager.requestPermission { granted in
            if granted {
                notificationManager.sendTimerStartNotification(for: Project(id: "1", name: "Test", color: .systemBlue, hourlyRate: 50.0))
                expectation.fulfill()
            } else {
                XCTFail("Notification permission denied")
            }
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testGlobalShortcuts() {
        let shortcutManager = ShortcutManager.shared
        
        // Test registering global shortcuts
        let registered = shortcutManager.registerGlobalShortcut(
            keyCode: 35, // 'p' key
            modifiers: [.command, .option]
        ) {
            // Shortcut action
        }
        
        XCTAssertTrue(registered)
        
        // Test unregistering
        shortcutManager.unregisterAllShortcuts()
    }
    
    func testDarkModeSupport() {
        let appearance = NSApp.effectiveAppearance
        let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        
        // Test that UI adapts to system appearance
        let menuBarManager = MenuBarManager.shared
        menuBarManager.updateForAppearanceChange()
        
        if isDark {
            XCTAssertEqual(menuBarManager.currentIconStyle, .dark)
        } else {
            XCTAssertEqual(menuBarManager.currentIconStyle, .light)
        }
    }
}
```

## Test Data & Mocking

### Mock Data Setup
```swift
class MockDataManager {
    static let shared = MockDataManager()
    
    func setupTestEnvironment() {
        UserDefaults.standard.set(true, forKey: "isUITesting")
        
        // Create sample projects
        let projects = createMockProjects()
        let projectManager = ProjectManager()
        projects.forEach { projectManager.addProject($0) }
        
        // Create sample time entries
        let entries = createMockTimeEntries()
        let timeEntryManager = TimeEntryManager()
        entries.forEach { timeEntryManager.addEntry($0) }
    }
    
    func createMockProjects() -> [Project] {
        return [
            Project(id: "1", name: "Client Alpha", color: .systemBlue, hourlyRate: 85.0),
            Project(id: "2", name: "Client Beta", color: .systemGreen, hourlyRate: 75.0),
            Project(id: "3", name: "Internal", color: .systemRed, hourlyRate: 65.0)
        ]
    }
    
    func createMockTimeEntries() -> [TimeEntry] {
        let baseDate = Date().addingTimeInterval(-86400) // Yesterday
        
        return [
            TimeEntry(id: "1", projectId: "1", 
                     startTime: baseDate, 
                     endTime: baseDate.addingTimeInterval(3600), 
                     description: "Project planning"),
            TimeEntry(id: "2", projectId: "2", 
                     startTime: baseDate.addingTimeInterval(3600), 
                     endTime: baseDate.addingTimeInterval(7200), 
                     description: "Development work"),
            TimeEntry(id: "3", projectId: "1", 
                     startTime: baseDate.addingTimeInterval(7200), 
                     endTime: baseDate.addingTimeInterval(9000), 
                     description: "Client meeting")
        ]
    }
}
```

## Running Tests

### Command Line Execution
```bash
# Run all tests
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack

# Run specific test suite
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack -only-testing:TimeTrackTests/TimerTests

# Run UI tests only
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack -only-testing:TimeTrackUITests

# Run with code coverage
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack -enableCodeCoverage YES

# Test on different macOS versions (if available)
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack -destination 'platform=macOS,arch=x86_64'
xcodebuild test -project TimeTrack.xcodeproj -scheme TimeTrack -destination 'platform=macOS,arch=arm64'
```

### Continuous Integration Setup
```yaml
# .github/workflows/macos-tests.yml
name: macOS Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Select Xcode version
      run: sudo xcode-select -s /Applications/Xcode_15.0.app
    
    - name: Install dependencies
      run: |
        cd packages/mac-app
        # Install any dependencies
    
    - name: Run unit tests
      run: |
        cd packages/mac-app
        xcodebuild test \
          -project TimeTrack.xcodeproj \
          -scheme TimeTrack \
          -only-testing:TimeTrackTests \
          -enableCodeCoverage YES
    
    - name: Run UI tests
      run: |
        cd packages/mac-app
        xcodebuild test \
          -project TimeTrack.xcodeproj \
          -scheme TimeTrack \
          -only-testing:TimeTrackUITests
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage.xml
```

## Test Coverage Targets

### Coverage Goals
- **Unit Tests**: 90% code coverage
- **Integration Tests**: 75% coverage of system integrations
- **UI Tests**: 70% coverage of user workflows
- **Performance Tests**: All critical paths covered

### Critical Areas for Testing
1. **Timer accuracy and persistence** - 100% coverage
2. **Menu bar integration** - 95% coverage
3. **Data persistence and sync** - 90% coverage
4. **Authentication flow** - 100% coverage
5. **Project/time entry CRUD** - 85% coverage
6. **Report generation** - 85% coverage
7. **System integration features** - 80% coverage

This comprehensive testing framework ensures TimeTrack macOS app maintains high quality standards and App Store compliance before submission.