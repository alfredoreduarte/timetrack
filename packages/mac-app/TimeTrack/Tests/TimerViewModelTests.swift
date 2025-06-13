import XCTest
@testable import TimeTrack

@MainActor
final class TimerViewModelTests: XCTestCase {

    var viewModel: TimerViewModel!
    var mockAPIClient: MockAPIClient!

    override func setUpWithError() throws {
        mockAPIClient = MockAPIClient()
        viewModel = TimerViewModel()
        // We'll need to inject the mock API client here
        // For now, we'll test the logic directly
    }

    override func tearDownWithError() throws {
        viewModel = nil
        mockAPIClient = nil
    }

    func testRunningTimerDetectionOnAppLoad() async throws {
        // Given: API returns a running timer
        let runningEntry = TimeEntry(
            id: "test-entry-id",
            description: "Working on homepage",
            startTime: "2024-01-15T14:00:00.000Z",
            endTime: nil,
            duration: 0,
            isRunning: true,
            hourlyRateSnapshot: 90.0,
            projectId: "test-project-id",
            taskId: "test-task-id",
            userId: "test-user-id",
            createdAt: "2024-01-15T14:00:00.000Z",
            updatedAt: "2024-01-15T14:00:00.000Z",
            project: TimeEntry.TimeEntryProject(
                id: "test-project-id",
                name: "Website Redesign",
                color: "#3B82F6"
            ),
            task: TimeEntry.TimeEntryTask(
                id: "test-task-id",
                name: "Homepage Layout"
            )
        )

        // When: We set the current entry (simulating API response)
        viewModel.currentEntry = runningEntry

        // Then: The view model should recognize it's running
        XCTAssertTrue(viewModel.isRunning, "ViewModel should detect running timer")
        XCTAssertEqual(viewModel.currentEntry?.id, "test-entry-id")
        XCTAssertEqual(viewModel.currentEntry?.isRunning, true)
        XCTAssertNil(viewModel.currentEntry?.endTime, "Running timer should have no end time")
    }

    func testStoppedTimerDetectionOnAppLoad() async throws {
        // Given: API returns a stopped timer
        let stoppedEntry = TimeEntry(
            id: "test-entry-id",
            description: "Completed task",
            startTime: "2024-01-15T14:00:00.000Z",
            endTime: "2024-01-15T16:30:00.000Z",
            duration: 9000,
            isRunning: false,
            hourlyRateSnapshot: 90.0,
            projectId: "test-project-id",
            taskId: "test-task-id",
            userId: "test-user-id",
            createdAt: "2024-01-15T14:00:00.000Z",
            updatedAt: "2024-01-15T16:30:00.000Z",
            project: TimeEntry.TimeEntryProject(
                id: "test-project-id",
                name: "Website Redesign",
                color: "#3B82F6"
            ),
            task: TimeEntry.TimeEntryTask(
                id: "test-task-id",
                name: "Homepage Layout"
            )
        )

        // When: We set the current entry (simulating API response)
        viewModel.currentEntry = stoppedEntry

        // Then: The view model should recognize it's not running
        XCTAssertFalse(viewModel.isRunning, "ViewModel should detect stopped timer")
        XCTAssertEqual(viewModel.currentEntry?.id, "test-entry-id")
        XCTAssertEqual(viewModel.currentEntry?.isRunning, false)
        XCTAssertNotNil(viewModel.currentEntry?.endTime, "Stopped timer should have an end time")
    }

    func testNoCurrentTimerOnAppLoad() async throws {
        // Given: API returns no current timer
        viewModel.currentEntry = nil

        // Then: The view model should recognize no timer is running
        XCTAssertFalse(viewModel.isRunning, "ViewModel should detect no running timer")
        XCTAssertNil(viewModel.currentEntry)
    }

    func testProjectAndTaskNamesFromPopulatedData() async throws {
        // Given: A time entry with populated project and task data
        let entryWithPopulatedData = TimeEntry(
            id: "test-entry-id",
            description: "Working on homepage",
            startTime: "2024-01-15T14:00:00.000Z",
            endTime: nil,
            duration: 0,
            isRunning: true,
            hourlyRateSnapshot: 90.0,
            projectId: "test-project-id",
            taskId: "test-task-id",
            userId: "test-user-id",
            createdAt: "2024-01-15T14:00:00.000Z",
            updatedAt: "2024-01-15T14:00:00.000Z",
            project: TimeEntry.TimeEntryProject(
                id: "test-project-id",
                name: "Website Redesign",
                color: "#3B82F6"
            ),
            task: TimeEntry.TimeEntryTask(
                id: "test-task-id",
                name: "Homepage Layout"
            )
        )

        // When: We get the project and task names
        let projectName = viewModel.getProjectName(for: entryWithPopulatedData)
        let taskName = viewModel.getTaskName(for: entryWithPopulatedData)

        // Then: It should use the populated data
        XCTAssertEqual(projectName, "Website Redesign")
        XCTAssertEqual(taskName, "Homepage Layout")
    }
}

// MARK: - Mock API Client (for future use)
class MockAPIClient {
    var mockCurrentEntry: TimeEntry?
    var mockError: Error?

    func getCurrentEntry() async throws -> TimeEntry? {
        if let error = mockError {
            throw error
        }
        return mockCurrentEntry
    }
}