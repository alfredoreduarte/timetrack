# TimeTrack API Documentation

## Overview
TimeTrack API is a comprehensive time tracking service similar to Toggl, providing project management, time tracking, and reporting capabilities.

**Base URL:** `http://localhost:3011`
**API Version:** v1
**Authentication:** JWT Bearer Token

## Quick Start

### 1. Register a User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### 2. Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 3. Use the Token
Include the JWT token in all subsequent requests:
```bash
Authorization: Bearer <your-jwt-token>
```

## Authentication

### Register User
- **POST** `/api/auth/register`
- **Description:** Create a new user account
- **Request Body:**
  ```json
  {
    "email": "john.doe@example.com",
    "password": "securePassword123",
    "name": "John Doe",
    "defaultHourlyRate": 75.50
  }
  ```
- **Success Response (201):**
  ```json
  {
    "message": "User registered successfully",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "john.doe@example.com",
      "name": "John Doe",
      "defaultHourlyRate": 75.50,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Error Response (400):**
  ```json
  {
    "error": "User with this email already exists"
  }
  ```

### Login User
- **POST** `/api/auth/login`
- **Description:** Authenticate user and receive JWT token
- **Request Body:**
  ```json
  {
    "email": "john.doe@example.com",
    "password": "securePassword123"
  }
  ```
- **Success Response (200):**
  ```json
  {
    "message": "Login successful",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "defaultHourlyRate": 75.50
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Error Response (401):**
  ```json
  {
    "error": "Invalid credentials"
  }
  ```

### Get Current User
- **GET** `/api/auth/me`
- **Description:** Get current authenticated user's profile
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200):**
  ```json
  {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "john.doe@example.com",
      "name": "John Doe",
      "defaultHourlyRate": 75.50,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
  ```

### Refresh Token
- **POST** `/api/auth/refresh`
- **Description:** Generate a new JWT token using current valid token
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200):**
  ```json
  {
    "message": "Token refreshed successfully",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

## User Management

### Update Profile
- **PUT** `/api/users/profile`
- **Description:** Update user profile information
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "name": "John Smith",
    "email": "john.smith@example.com",
    "defaultHourlyRate": 80.00
  }
  ```
- **Success Response (200):**
  ```json
  {
    "message": "Profile updated successfully",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Smith",
      "email": "john.smith@example.com",
      "defaultHourlyRate": 80.00,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T14:45:00.000Z"
    }
  }
  ```
- **Error Response (400):**
  ```json
  {
    "error": "Email is already taken"
  }
  ```

### Change Password
- **POST** `/api/users/change-password`
- **Description:** Change user password
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "currentPassword": "oldPassword123",
    "newPassword": "newSecurePassword456"
  }
  ```
- **Success Response (200):**
  ```json
  {
    "message": "Password changed successfully"
  }
  ```
- **Error Response (400):**
  ```json
  {
    "error": "Current password is incorrect"
  }
  ```

### Get User Statistics
- **GET** `/api/users/stats`
- **Description:** Get comprehensive user statistics
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200):**
  ```json
  {
    "stats": {
      "totalProjects": 5,
      "activeProjects": 3,
      "totalTasks": 23,
      "completedTasks": 18,
      "totalTimeEntries": 156,
      "totalTimeTracked": 432000,
      "thisWeekTime": 28800,
      "runningTimeEntry": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "startTime": "2024-01-15T09:00:00.000Z",
        "project": {
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "task": {
          "name": "Homepage Layout"
        }
      }
    }
  }
  ```

## Projects

### Create Project
- **POST** `/api/projects`
- **Description:** Create a new project
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "name": "Website Redesign",
    "description": "Complete redesign of company website",
    "color": "#3B82F6",
    "hourlyRate": 85.00
  }
  ```
- **Success Response (201):**
  ```json
  {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Website Redesign",
    "description": "Complete redesign of company website",
    "color": "#3B82F6",
    "hourlyRate": 85.00,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isActive": true,
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
  ```

### Get All Projects
- **GET** `/api/projects`
- **Description:** Get all projects for the authenticated user
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200):**
  ```json
  [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Website Redesign",
      "description": "Complete redesign of company website",
      "color": "#3B82F6",
      "hourlyRate": 85.00,
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "isActive": true,
      "createdAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Mobile App Development",
      "description": "iOS and Android app development",
      "color": "#10B981",
      "hourlyRate": 95.00,
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "isActive": true,
      "createdAt": "2024-01-10T09:30:00.000Z",
      "updatedAt": "2024-01-10T09:30:00.000Z"
    }
  ]
  ```

### Get Project by ID
- **GET** `/api/projects/:id`
- **Description:** Get a specific project by ID
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Project UUID
- **Success Response (200):**
  ```json
  {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Website Redesign",
    "description": "Complete redesign of company website",
    "color": "#3B82F6",
    "hourlyRate": 85.00,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isActive": true,
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
  ```
- **Error Response (404):**
  ```json
  {
    "error": "Project not found"
  }
  ```

### Update Project
- **PUT** `/api/projects/:id`
- **Description:** Update an existing project
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Project UUID
- **Request Body:**
  ```json
  {
    "name": "Website Redesign v2",
    "description": "Complete redesign with new branding",
    "hourlyRate": 90.00,
    "isActive": false
  }
  ```
- **Success Response (200):**
  ```json
  {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Website Redesign v2",
    "description": "Complete redesign with new branding",
    "color": "#3B82F6",
    "hourlyRate": 90.00,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isActive": false,
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T15:30:00.000Z"
  }
  ```

### Delete Project
- **DELETE** `/api/projects/:id`
- **Description:** Delete a project (soft delete)
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Project UUID
- **Success Response (204):** No content

## Tasks

### Create Task
- **POST** `/api/tasks`
- **Description:** Create a new task within a project
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "name": "Homepage Layout",
    "description": "Design and implement the new homepage layout",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "hourlyRate": 90.00
  }
  ```
- **Success Response (201):**
  ```json
  {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "name": "Homepage Layout",
    "description": "Design and implement the new homepage layout",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "hourlyRate": 90.00,
    "isCompleted": false,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
  ```

### Get All Tasks
- **GET** `/api/tasks`
- **Description:** Get all tasks for the authenticated user
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `projectId` (optional): Filter by project ID
  - `isCompleted` (optional): Filter by completion status (true/false)
- **Example Request:** `GET /api/tasks?projectId=770e8400-e29b-41d4-a716-446655440002&isCompleted=false`
- **Success Response (200):**
  ```json
  {
    "tasks": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440004",
        "name": "Homepage Layout",
        "description": "Design and implement the new homepage layout",
        "projectId": "770e8400-e29b-41d4-a716-446655440002",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "hourlyRate": 90.00,
        "isCompleted": false,
        "createdAt": "2024-01-15T12:00:00.000Z",
        "updatedAt": "2024-01-15T12:00:00.000Z",
        "project": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "_count": {
          "timeEntries": 5
        }
      }
    ]
  }
  ```

### Get Task by ID
- **GET** `/api/tasks/:id`
- **Description:** Get a specific task by ID
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Task UUID
- **Success Response (200):**
  ```json
  {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "name": "Homepage Layout",
    "description": "Design and implement the new homepage layout",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "hourlyRate": 90.00,
    "isCompleted": false,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z",
    "project": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Website Redesign",
      "color": "#3B82F6"
    }
  }
  ```

### Update Task
- **PUT** `/api/tasks/:id`
- **Description:** Update an existing task
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Task UUID
- **Request Body:**
  ```json
  {
    "name": "Homepage Layout - Responsive",
    "description": "Design and implement responsive homepage layout",
    "isCompleted": true,
    "hourlyRate": 95.00
  }
  ```
- **Success Response (200):**
  ```json
  {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "name": "Homepage Layout - Responsive",
    "description": "Design and implement responsive homepage layout",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "hourlyRate": 95.00,
    "isCompleted": true,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T16:30:00.000Z"
  }
  ```

### Delete Task
- **DELETE** `/api/tasks/:id`
- **Description:** Delete a task
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Task UUID
- **Success Response (204):** No content

## Time Entries

### Start Time Entry
- **POST** `/api/time-entries/start`
- **Description:** Start a new time tracking session
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "description": "Working on homepage layout",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004"
  }
  ```
- **Success Response (201):**
  ```json
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440005",
    "description": "Working on homepage layout",
    "startTime": "2024-01-15T14:00:00.000Z",
    "endTime": null,
    "duration": 0,
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": true,
    "hourlyRateSnapshot": 90.00,
    "createdAt": "2024-01-15T14:00:00.000Z",
    "updatedAt": "2024-01-15T14:00:00.000Z"
  }
  ```
- **Error Response (400):**
  ```json
  {
    "error": "You already have a running time entry. Stop it first."
  }
  ```

### Stop Time Entry
- **POST** `/api/time-entries/:id/stop`
- **Description:** Stop a running time entry
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Time Entry UUID
- **Success Response (200):**
  ```json
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440005",
    "description": "Working on homepage layout",
    "startTime": "2024-01-15T14:00:00.000Z",
    "endTime": "2024-01-15T16:30:00.000Z",
    "duration": 9000,
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": false,
    "hourlyRateSnapshot": 90.00,
    "createdAt": "2024-01-15T14:00:00.000Z",
    "updatedAt": "2024-01-15T16:30:00.000Z"
  }
  ```

### Get Current Running Entry
- **GET** `/api/time-entries/current`
- **Description:** Get the currently running time entry
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200) - With running entry:**
  ```json
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440005",
    "description": "Working on homepage layout",
    "startTime": "2024-01-15T14:00:00.000Z",
    "endTime": null,
    "duration": 0,
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": true,
    "hourlyRateSnapshot": 90.00,
    "project": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Website Redesign",
      "color": "#3B82F6"
    },
    "task": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "name": "Homepage Layout"
    },
    "createdAt": "2024-01-15T14:00:00.000Z",
    "updatedAt": "2024-01-15T14:00:00.000Z"
  }
  ```
- **Success Response (200) - No running entry:**
  ```json
  null
  ```

### Create Manual Time Entry
- **POST** `/api/time-entries`
- **Description:** Create a manual time entry with specific start and end times
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "description": "Bug fixes and testing",
    "startTime": "2024-01-15T09:00:00.000Z",
    "endTime": "2024-01-15T12:00:00.000Z",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004"
  }
  ```
- **Success Response (201):**
  ```json
  {
    "id": "bb0e8400-e29b-41d4-a716-446655440006",
    "description": "Bug fixes and testing",
    "startTime": "2024-01-15T09:00:00.000Z",
    "endTime": "2024-01-15T12:00:00.000Z",
    "duration": 10800,
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": false,
    "hourlyRateSnapshot": 90.00,
    "createdAt": "2024-01-15T13:00:00.000Z",
    "updatedAt": "2024-01-15T13:00:00.000Z"
  }
  ```

### Get All Time Entries
- **GET** `/api/time-entries`
- **Description:** Get paginated list of time entries
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Filter from date (YYYY-MM-DD)
  - `endDate` (optional): Filter to date (YYYY-MM-DD)
  - `projectId` (optional): Filter by project
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 50, max: 100)
- **Example Request:** `GET /api/time-entries?startDate=2024-01-15&endDate=2024-01-16&projectId=770e8400-e29b-41d4-a716-446655440002&page=1&limit=10`
- **Success Response (200):**
  ```json
  {
    "entries": [
      {
        "id": "aa0e8400-e29b-41d4-a716-446655440005",
        "description": "Working on homepage layout",
        "startTime": "2024-01-15T14:00:00.000Z",
        "endTime": "2024-01-15T16:30:00.000Z",
        "duration": 9000,
        "projectId": "770e8400-e29b-41d4-a716-446655440002",
        "taskId": "990e8400-e29b-41d4-a716-446655440004",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "isRunning": false,
        "hourlyRateSnapshot": 90.00,
        "project": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "task": {
          "id": "990e8400-e29b-41d4-a716-446655440004",
          "name": "Homepage Layout"
        },
        "createdAt": "2024-01-15T14:00:00.000Z",
        "updatedAt": "2024-01-15T16:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
  ```

### Update Time Entry
- **PUT** `/api/time-entries/:id`
- **Description:** Update an existing time entry
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Time Entry UUID
- **Request Body:**
  ```json
  {
    "description": "Homepage layout with responsive design",
    "startTime": "2024-01-15T14:00:00.000Z",
    "endTime": "2024-01-15T17:00:00.000Z",
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004"
  }
  ```
- **Success Response (200):**
  ```json
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440005",
    "description": "Homepage layout with responsive design",
    "startTime": "2024-01-15T14:00:00.000Z",
    "endTime": "2024-01-15T17:00:00.000Z",
    "duration": 10800,
    "projectId": "770e8400-e29b-41d4-a716-446655440002",
    "taskId": "990e8400-e29b-41d4-a716-446655440004",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "isRunning": false,
    "hourlyRateSnapshot": 90.00,
    "createdAt": "2024-01-15T14:00:00.000Z",
    "updatedAt": "2024-01-15T18:00:00.000Z"
  }
  ```

### Delete Time Entry
- **DELETE** `/api/time-entries/:id`
- **Description:** Delete a time entry
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Time Entry UUID
- **Success Response (204):** No content

## Reports

### Get Summary Report
- **GET** `/api/reports/summary`
- **Description:** Get aggregated time tracking summary
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO format)
  - `endDate` (optional): End date (ISO format)
  - `projectId` (optional): Filter by project ID
- **Example Request:** `GET /api/reports/summary?startDate=2024-01-01T00:00:00.000Z&endDate=2024-01-31T23:59:59.999Z&projectId=770e8400-e29b-41d4-a716-446655440002`
- **Success Response (200):**
  ```json
  {
    "summary": {
      "totalDuration": 432000,
      "totalEarnings": 10800.00,
      "entryCount": 48,
      "averageSessionDuration": 9000,
      "projectBreakdown": [
        {
          "projectId": "770e8400-e29b-41d4-a716-446655440002",
          "projectName": "Website Redesign",
          "color": "#3B82F6",
          "totalDuration": 259200,
          "totalEarnings": 6480.00,
          "entryCount": 29
        },
        {
          "projectId": "880e8400-e29b-41d4-a716-446655440003",
          "projectName": "Mobile App Development",
          "color": "#10B981",
          "totalDuration": 172800,
          "totalEarnings": 4320.00,
          "entryCount": 19
        }
      ],
      "dailyBreakdown": [
        {
          "date": "2024-01-15",
          "totalDuration": 28800,
          "totalEarnings": 720.00,
          "entryCount": 3
        },
        {
          "date": "2024-01-16",
          "totalDuration": 25200,
          "totalEarnings": 630.00,
          "entryCount": 2
        }
      ]
    }
  }
  ```

### Get Detailed Report
- **GET** `/api/reports/detailed`
- **Description:** Get detailed time entries with full information
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO format)
  - `endDate` (optional): End date (ISO format)
  - `projectId` (optional): Filter by project ID
  - `taskId` (optional): Filter by task ID
- **Example Request:** `GET /api/reports/detailed?startDate=2024-01-15T00:00:00.000Z&endDate=2024-01-16T23:59:59.999Z`
- **Success Response (200):**
  ```json
  {
    "entries": [
      {
        "id": "aa0e8400-e29b-41d4-a716-446655440005",
        "description": "Working on homepage layout",
        "startTime": "2024-01-15T14:00:00.000Z",
        "endTime": "2024-01-15T16:30:00.000Z",
        "duration": 9000,
        "hourlyRateSnapshot": 90.00,
        "earnings": 225.00,
        "project": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "task": {
          "id": "990e8400-e29b-41d4-a716-446655440004",
          "name": "Homepage Layout"
        },
        "createdAt": "2024-01-15T14:00:00.000Z"
      }
    ],
    "summary": {
      "totalDuration": 9000,
      "totalEarnings": 225.00,
      "entryCount": 1
    }
  }
  ```

### Get Project Report
- **GET** `/api/reports/projects`
- **Description:** Get time tracking report grouped by projects
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO format)
  - `endDate` (optional): End date (ISO format)
- **Success Response (200):**
  ```json
  {
    "projects": [
      {
        "project": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "totalDuration": 259200,
        "totalEarnings": 6480.00,
        "entryCount": 29,
        "averageSessionDuration": 8938,
        "tasks": [
          {
            "task": {
              "id": "990e8400-e29b-41d4-a716-446655440004",
              "name": "Homepage Layout"
            },
            "totalDuration": 86400,
            "totalEarnings": 2160.00,
            "entryCount": 10
          }
        ]
      }
    ],
    "summary": {
      "totalDuration": 432000,
      "totalEarnings": 10800.00,
      "totalProjects": 2
    }
  }
  ```

### Get Time Report
- **GET** `/api/reports/time`
- **Description:** Get time-based analytics and trends
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO format)
  - `endDate` (optional): End date (ISO format)
  - `groupBy` (optional): Group by 'day', 'week', or 'month' (default: 'day')
- **Example Request:** `GET /api/reports/time?startDate=2024-01-01T00:00:00.000Z&endDate=2024-01-31T23:59:59.999Z&groupBy=week`
- **Success Response (200):**
  ```json
  {
    "timeBreakdown": [
      {
        "period": "2024-W03",
        "startDate": "2024-01-15",
        "endDate": "2024-01-21",
        "totalDuration": 144000,
        "totalEarnings": 3600.00,
        "entryCount": 16,
        "averageDaily": 20571,
        "projects": [
          {
            "projectId": "770e8400-e29b-41d4-a716-446655440002",
            "projectName": "Website Redesign",
            "duration": 86400,
            "earnings": 2160.00
          }
        ]
      }
    ],
    "summary": {
      "totalDuration": 432000,
      "totalEarnings": 10800.00,
      "averageDailyTime": 13935,
      "mostProductiveDay": "Monday",
      "mostProductiveHour": 14
    }
  }
  ```

## Health Check

### Health Status
- **GET** `/health`
- **Description:** Check API health status
- **Success Response (200):**
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-15T16:30:00.000Z",
    "uptime": 86400,
    "version": "1.0.0",
    "database": "connected"
  }
  ```

## Error Responses

All endpoints may return these standardized error responses:

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email address"
    },
    {
      "field": "password",
      "message": "Password must be at least 6 characters"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Access denied. No token provided."
}
```

### 403 Forbidden
```json
{
  "error": "Access denied. Invalid token."
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 409 Conflict
```json
{
  "error": "You already have a running time entry. Stop it first."
}
```

### 422 Unprocessable Entity
```json
{
  "error": "End time must be after start time"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded. Try again later.",
  "retryAfter": 900
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "requestId": "req_123456789"
}
```

## Data Models

### User
```typescript
interface User {
  id: string;                    // UUID
  email: string;                 // Unique email address
  name: string;                  // Full name
  defaultHourlyRate?: number;    // Default hourly rate in currency units
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}
```

### Project
```typescript
interface Project {
  id: string;                    // UUID
  name: string;                  // Project name
  description?: string;          // Optional description
  color?: string;                // Hex color code (e.g., "#3B82F6")
  hourlyRate?: number;           // Project-specific hourly rate
  userId: string;                // Owner user ID
  isActive: boolean;             // Whether project is active
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
}
```

### Task
```typescript
interface Task {
  id: string;                    // UUID
  name: string;                  // Task name
  description?: string;          // Optional description
  projectId: string;             // Parent project ID
  userId: string;                // Owner user ID
  hourlyRate?: number;           // Task-specific hourly rate
  isCompleted: boolean;          // Whether task is completed
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
  project?: {                    // Populated project data (when included)
    id: string;
    name: string;
    color?: string;
  };
  _count?: {                     // Count of related records (when included)
    timeEntries: number;
  };
}
```

### TimeEntry
```typescript
interface TimeEntry {
  id: string;                    // UUID
  description?: string;          // Optional description
  startTime: string;             // ISO date string
  endTime?: string;              // ISO date string (null if running)
  duration: number;              // Duration in seconds
  projectId?: string;            // Optional project ID
  taskId?: string;               // Optional task ID
  userId: string;                // Owner user ID
  isRunning: boolean;            // Whether entry is currently running
  hourlyRateSnapshot?: number;   // Rate at time of creation
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
  project?: Project;             // Populated project data
  task?: Task;                   // Populated task data
}
```

## Rate Limiting
- **Current Status:** 1000 requests per 15 minutes per IP
- **Headers Included:**
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

## CORS
- **Development:** Allows all origins (`*`)
- **Production:** Configure specific allowed origins

## Authentication Details

### JWT Token Structure
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "john.doe@example.com",
  "iat": 1642248000,
  "exp": 1642852800
}
```

### Token Expiration
- **Default:** 7 days
- **Configurable:** Via `JWT_EXPIRES_IN` environment variable
- **Refresh:** Use `/api/auth/refresh` endpoint

## Pagination

For endpoints that return lists (time entries, etc.), pagination follows this structure:

### Request Parameters
- `page`: Page number (1-based, default: 1)
- `limit`: Items per page (default: 50, max: 100)

### Response Structure
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Date and Time Handling

### Format
- **All dates:** ISO 8601 format (`2024-01-15T14:30:00.000Z`)
- **Duration:** Always in seconds
- **Timezone:** UTC (clients should handle local timezone conversion)

### Examples
```json
{
  "startTime": "2024-01-15T14:30:00.000Z",
  "endTime": "2024-01-15T16:30:00.000Z",
  "duration": 7200
}
```

## Hourly Rate Hierarchy

The system uses a hierarchical approach for determining hourly rates:

1. **Task-specific rate** (highest priority)
2. **Project-specific rate**
3. **User default rate**
4. **System default** (if none set)

### Rate Snapshot
When a time entry is created, the applicable rate is stored in `hourlyRateSnapshot` to maintain historical accuracy even if rates change later.

## Notes for Frontend Development

### 1. Authentication Flow
```javascript
// Store token securely
localStorage.setItem('timetrack_token', token);

// Include in requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// Handle token expiration
if (response.status === 401) {
  // Redirect to login or refresh token
}
```

### 2. Time Tracking
```javascript
// Poll for current timer
setInterval(async () => {
  const current = await fetch('/api/time-entries/current', { headers });
  if (current) {
    updateTimerUI(current);
  }
}, 1000);

// Start timer
const startTimer = async (data) => {
  try {
    const response = await fetch('/api/time-entries/start', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    handleError(error);
  }
};
```

### 3. Error Handling
```javascript
const handleApiError = (error, response) => {
  switch (response.status) {
    case 400:
      // Show validation errors
      showValidationErrors(error.details);
      break;
    case 401:
      // Redirect to login
      redirectToLogin();
      break;
    case 429:
      // Show rate limit message
      showRateLimit(error.retryAfter);
      break;
    default:
      // Show generic error
      showError(error.error);
  }
};
```

### 4. Data Synchronization
```javascript
// Optimistic updates
const updateTimeEntry = async (id, data) => {
  // Update UI immediately
  updateUIOptimistically(id, data);

  try {
    const response = await fetch(`/api/time-entries/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      // Revert optimistic update
      revertUIUpdate(id);
      throw new Error('Update failed');
    }

    const updated = await response.json();
    updateUIWithServerData(updated);
  } catch (error) {
    handleError(error);
  }
};
```

### 5. Offline Handling
```javascript
// Queue actions when offline
const queueAction = (action) => {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  queue.push({ ...action, timestamp: Date.now() });
  localStorage.setItem('offline_queue', JSON.stringify(queue));
};

// Process queue when back online
window.addEventListener('online', async () => {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  for (const action of queue) {
    try {
      await processAction(action);
    } catch (error) {
      console.error('Failed to sync action:', action, error);
    }
  }
  localStorage.removeItem('offline_queue');
});
```

## Interactive API Documentation
Visit `http://localhost:3011/api-docs` when the server is running for interactive Swagger documentation with live testing capabilities.

## Changelog

### Version 1.0.0
- Initial API release
- Authentication system
- Project and task management
- Time tracking functionality
- Reporting system
- Rate limiting implementation