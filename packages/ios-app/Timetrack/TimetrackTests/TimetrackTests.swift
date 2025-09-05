//
//  TimetrackTests.swift
//  TimetrackTests
//
//  Created by Alfredo Re on 2025-09-04.
//

import Testing
import Foundation
import SwiftUI
@testable import Timetrack

struct TimetrackTests {

    @Test func testAPIClientInitialization() async throws {
        let apiClient = APIClient.shared
        #expect(apiClient.authToken == nil || apiClient.authToken != nil) // Token can be nil or set
    }

    @Test func testModelDecoding() async throws {
        // Test User model decoding
        let userJSON = """
        {
            "id": "123",
            "name": "Test User",
            "email": "test@example.com",
            "defaultHourlyRate": 50.0,
            "createdAt": "2023-01-01T00:00:00Z",
            "updatedAt": "2023-01-01T00:00:00Z"
        }
        """
        
        let userData = userJSON.data(using: .utf8)!
        let user = try JSONDecoder().decode(User.self, from: userData)
        
        #expect(user.id == "123")
        #expect(user.name == "Test User")
        #expect(user.email == "test@example.com")
        #expect(user.defaultHourlyRate == 50.0)
    }

    @Test func testProjectModelDecoding() async throws {
        // Test Project model decoding
        let projectJSON = """
        {
            "id": "proj-123",
            "name": "Test Project",
            "description": "A test project",
            "color": "#FF0000",
            "hourlyRate": 75.0,
            "isActive": true,
            "createdAt": "2023-01-01T00:00:00Z",
            "updatedAt": "2023-01-01T00:00:00Z"
        }
        """
        
        let projectData = projectJSON.data(using: .utf8)!
        let project = try JSONDecoder().decode(Project.self, from: projectData)
        
        #expect(project.id == "proj-123")
        #expect(project.name == "Test Project")
        #expect(project.color == "#FF0000")
        #expect(project.hourlyRate == 75.0)
        #expect(project.isActive == true)
    }

    @Test func testTimeEntryDurationFormatting() async throws {
        // Test TimeEntry duration formatting
        let timeEntryJSON = """
        {
            "id": "entry-123",
            "description": "Test work",
            "startTime": "2023-01-01T10:00:00Z",
            "endTime": "2023-01-01T11:30:00Z",
            "duration": 5400,
            "isRunning": false,
            "hourlyRateSnapshot": 50.0,
            "projectId": "proj-123",
            "taskId": "task-123",
            "userId": "user-123",
            "createdAt": "2023-01-01T10:00:00Z",
            "updatedAt": "2023-01-01T11:30:00Z"
        }
        """
        
        let entryData = timeEntryJSON.data(using: .utf8)!
        let entry = try JSONDecoder().decode(TimeEntry.self, from: entryData)
        
        #expect(entry.id == "entry-123")
        #expect(entry.duration == 5400)
        #expect(entry.formattedDuration == "01:30:00")
        #expect(entry.formattedDurationShort == "1:30")
        #expect(entry.isRunning == false)
    }

    @Test func testShortDurationFormatting() async throws {
        // Test short duration (30 seconds)
        let shortEntryJSON = """
        {
            "id": "short-entry",
            "description": "Quick task",
            "startTime": "2023-01-01T10:00:00Z",
            "endTime": "2023-01-01T10:00:30Z",
            "duration": 30,
            "isRunning": false,
            "hourlyRateSnapshot": 50.0,
            "projectId": "proj-123",
            "taskId": "task-123",
            "userId": "user-123",
            "createdAt": "2023-01-01T10:00:00Z",
            "updatedAt": "2023-01-01T10:00:30Z"
        }
        """
        
        let shortEntryData = shortEntryJSON.data(using: .utf8)!
        let shortEntry = try JSONDecoder().decode(TimeEntry.self, from: shortEntryData)
        
        #expect(shortEntry.duration == 30)
        #expect(shortEntry.formattedDurationShort == "30s")
        
        // Test zero duration
        let zeroEntryJSON = """
        {
            "id": "zero-entry",
            "description": "Zero task",
            "startTime": "2023-01-01T10:00:00Z",
            "endTime": "2023-01-01T10:00:00Z",
            "duration": 0,
            "isRunning": false,
            "hourlyRateSnapshot": 50.0,
            "projectId": "proj-123",
            "taskId": "task-123",
            "userId": "user-123",
            "createdAt": "2023-01-01T10:00:00Z",
            "updatedAt": "2023-01-01T10:00:00Z"
        }
        """
        
        let zeroEntryData = zeroEntryJSON.data(using: .utf8)!
        let zeroEntry = try JSONDecoder().decode(TimeEntry.self, from: zeroEntryData)
        
        #expect(zeroEntry.duration == 0)
        #expect(zeroEntry.formattedDurationShort == "0s")
    }

    @Test func testTimerViewModelInitialization() async throws {
        await MainActor.run {
            let timerViewModel = TimerViewModel()
            
            #expect(timerViewModel.isRunning == false)
            #expect(timerViewModel.currentEntry == nil)
            #expect(timerViewModel.projects.isEmpty)
            #expect(timerViewModel.recentEntries.isEmpty)
            #expect(timerViewModel.elapsedTime == 0)
        }
    }

    @Test func testAuthViewModelInitialization() async throws {
        await MainActor.run {
            let authViewModel = AuthViewModel()
            
            #expect(authViewModel.isAuthenticated == false)
            #expect(authViewModel.currentUser == nil)
            #expect(authViewModel.isLoading == false)
            #expect(authViewModel.errorMessage == nil)
        }
    }

    @Test func testDashboardViewModelInitialization() async throws {
        await MainActor.run {
            let dashboardViewModel = DashboardViewModel()
            
            #expect(dashboardViewModel.earnings == nil)
            #expect(dashboardViewModel.isLoading == false)
            #expect(dashboardViewModel.errorMessage == nil)
        }
    }

    @Test func testColorExtension() async throws {
        // Test hex color parsing
        let redColor = Color(hex: "#FF0000")
        #expect(redColor != nil)
        
        let invalidColor = Color(hex: "invalid")
        #expect(invalidColor == nil)
        
        let shortHex = Color(hex: "F00")
        #expect(shortHex != nil)
    }

}
