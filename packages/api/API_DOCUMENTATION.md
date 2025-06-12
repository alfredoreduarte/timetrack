# TimeTrack API Documentation

## Overview
TimeTrack API is a comprehensive time tracking service similar to Toggl, providing project management, time tracking, and reporting capabilities.

**Base URL:** `http://localhost:3011`
**API Version:** v1
**Authentication:** JWT Bearer Token

## Quick Start

### 1. Get Captcha (Required for Registration)
```bash
GET /auth/captcha
```

### 2. Register a User
```bash
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "password123",
  "captchaId": "captcha_session_id",
  "captchaValue": "captcha_answer",
  "defaultHourlyRate": 75.00
}
```

### 3. Login
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 4. Use the Token
Include the JWT token in all subsequent requests:
```bash
Authorization: Bearer <your-jwt-token>
```

## Authentication

### Get Captcha Challenge
- **GET** `/auth/captcha`
- **Description:** Generate a new captcha challenge for registration
- **Success Response (200):**
  ```json
  {
    "captchaId": "1642248000_abc123def456",
    "captchaSvg": "<svg>...</svg>"
  }
  ```

### Register User
- **POST** `/auth/register`
- **Description:** Create a new user account (requires captcha)
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "password": "securePassword123",
    "defaultHourlyRate": 75.50,
    "captchaId": "1642248000_abc123def456",
    "captchaValue": "ABC12"
  }
  ```
- **Validation:**
  - `name`: 2-50 characters
  - `email`: Valid email address (case insensitive)
  - `password`: 6-100 characters
  - `defaultHourlyRate`: Optional positive number
  - `captchaId`: Required valid captcha session ID
  - `captchaValue`: Required captcha answer
- **Success Response (201):**
  ```json
  {
    "message": "User registered successfully",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john.doe@example.com",
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
- **POST** `/auth/login`
- **Description:** Authenticate user and receive JWT token
- **Request Body:**
  ```json
  {
    "email": "john.doe@example.com",
    "password": "securePassword123"
  }
  ```
- **Validation:**
  - `email`: Valid email address (case insensitive)
  - `password`: Required
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
- **GET** `/auth/me`
- **Description:** Get current authenticated user's profile
- **Headers:** `Authorization: Bearer <token>`
- **Success Response (200):**
  ```json
  {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "defaultHourlyRate": 75.50,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
  ```

### Refresh Token
- **POST** `/auth/refresh`
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
- **PUT** `/users/profile`
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
- **Validation:**
  - `name`: Optional, 2+ characters if provided
  - `email`: Optional, valid email if provided
  - `defaultHourlyRate`: Optional, positive number if provided
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

### Change Password
- **POST** `/users/change-password`
- **Description:** Change user password
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "currentPassword": "oldPassword123",
    "newPassword": "newSecurePassword456"
  }
  ```
- **Validation:**
  - `currentPassword`: Required
  - `newPassword`: 6+ characters
- **Success Response (200):**
  ```json
  {
    "message": "Password changed successfully"
  }
  ```

### Get User Statistics
- **GET** `/users/stats`
- **Description:** Get comprehensive user statistics
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `timezone` (optional): Timezone for date calculations (e.g., "America/New_York")
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
      "todayTime": 7200,
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

### Get All Projects
- **GET** `/projects`
- **Description:** Get all projects for the authenticated user
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `isActive` (optional): Filter by active status (true/false)
- **Success Response (200):**
  ```json
  {
    "projects": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "name": "Website Redesign",
        "description": "Complete redesign of company website",
        "color": "#3B82F6",
        "hourlyRate": 85.00,
        "isActive": true,
        "createdAt": "2024-01-15T11:00:00.000Z",
        "updatedAt": "2024-01-15T11:00:00.000Z",
        "_count": {
          "tasks": 5,
          "timeEntries": 23
        }
      }
    ]
  }
  ```

### Create Project
- **POST** `/projects`
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
- **Validation:**
  - `name`: Required, non-empty string
  - `description`: Optional string
  - `color`: Optional hex color (e.g., "#3B82F6"), defaults to "#3B82F6"
  - `hourlyRate`: Optional positive number
- **Success Response (201):**
  ```json
  {
    "message": "Project created successfully",
    "project": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "Website Redesign",
      "description": "Complete redesign of company website",
      "color": "#3B82F6",
      "hourlyRate": 85.00,
      "isActive": true,
      "createdAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
  ```

### Get Project by ID
- **GET** `/projects/:id`
- **Description:** Get a specific project by ID with tasks
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
    "isActive": true,
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z",
    "tasks": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440004",
        "name": "Homepage Layout",
        "description": "Design homepage",
        "isCompleted": false,
        "hourlyRate": 90.00,
        "createdAt": "2024-01-15T12:00:00.000Z"
      }
    ],
    "_count": {
      "timeEntries": 23
    }
  }
  ```

### Update Project
- **PUT** `/projects/:id`
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
- **Validation:** Same as create, all fields optional
- **Success Response (200):** Same format as create

### Delete Project
- **DELETE** `/projects/:id`
- **Description:** Delete a project
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Project UUID
- **Success Response (200):**
  ```json
  {
    "message": "Project deleted successfully"
  }
  ```

## Tasks

### Get All Tasks
- **GET** `/tasks`
- **Description:** Get all tasks for the authenticated user
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `projectId` (optional): Filter by project ID
  - `isCompleted` (optional): Filter by completion status (true/false)
- **Success Response (200):**
  ```json
  {
    "tasks": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440004",
        "name": "Homepage Layout",
        "description": "Design and implement the new homepage layout",
        "isCompleted": false,
        "hourlyRate": 90.00,
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

### Create Task
- **POST** `/tasks`
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
- **Validation:**
  - `name`: Required, non-empty string
  - `description`: Optional string
  - `projectId`: Required, valid project UUID owned by user
  - `hourlyRate`: Optional positive number
- **Success Response (201):**
  ```json
  {
    "message": "Task created successfully",
    "task": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "name": "Homepage Layout",
      "description": "Design and implement the new homepage layout",
      "isCompleted": false,
      "hourlyRate": 90.00,
      "createdAt": "2024-01-15T12:00:00.000Z",
      "updatedAt": "2024-01-15T12:00:00.000Z",
      "project": {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "name": "Website Redesign",
        "color": "#3B82F6"
      }
    }
  }
  ```

### Get Task by ID
- **GET** `/tasks/:id`
- **Description:** Get a specific task by ID
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Task UUID
- **Success Response (200):** Same format as task in list

### Update Task
- **PUT** `/tasks/:id`
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
- **Validation:**
  - `name`: Optional, non-empty string if provided
  - `description`: Optional string
  - `isCompleted`: Optional boolean
  - `hourlyRate`: Optional positive number
- **Success Response (200):** Same format as create

### Delete Task
- **DELETE** `/tasks/:id`
- **Description:** Delete a task
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Task UUID
- **Success Response (200):**
  ```json
  {
    "message": "Task deleted successfully"
  }
  ```

## Time Entries

### Get All Time Entries
- **GET** `/time-entries`
- **Description:** Get paginated list of time entries
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `projectId` (optional): Filter by project ID
  - `isRunning` (optional): Filter by running status (true/false)
  - `startDate` (optional): Filter from date (YYYY-MM-DD or ISO format)
  - `endDate` (optional): Filter to date (YYYY-MM-DD or ISO format)
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 50, max: 100)
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
        "isRunning": false,
        "hourlyRateSnapshot": 90.00,
        "projectId": "770e8400-e29b-41d4-a716-446655440002",
        "taskId": "990e8400-e29b-41d4-a716-446655440004",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "createdAt": "2024-01-15T14:00:00.000Z",
        "updatedAt": "2024-01-15T16:30:00.000Z",
        "project": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "name": "Website Redesign",
          "color": "#3B82F6"
        },
        "task": {
          "id": "990e8400-e29b-41d4-a716-446655440004",
          "name": "Homepage Layout"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 25,
      "pages": 1
    }
  }
  ```

### Start Time Entry
- **POST** `/time-entries/start`
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
- **Validation:**
  - `description`: Optional string
  - `projectId`: Optional, valid project UUID owned by user
  - `taskId`: Optional, valid task UUID owned by user
- **Success Response (201):**
  ```json
  {
    "message": "Time entry started successfully",
    "timeEntry": {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "description": "Working on homepage layout",
      "startTime": "2024-01-15T14:00:00.000Z",
      "endTime": null,
      "duration": 0,
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
      }
    }
  }
  ```
- **Error Response (400):**
  ```json
  {
    "error": "You already have a running time entry. Please stop it first."
  }
  ```

### Stop Time Entry
- **POST** `/time-entries/:id/stop`
- **Description:** Stop a running time entry
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Time Entry UUID
- **Request Body:**
  ```json
  {
    "endTime": "2024-01-15T16:30:00.000Z"
  }
  ```
- **Validation:**
  - `endTime`: Optional ISO datetime (defaults to current time)
- **Success Response (200):**
  ```json
  {
    "message": "Time entry stopped successfully",
    "timeEntry": {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "description": "Working on homepage layout",
      "startTime": "2024-01-15T14:00:00.000Z",
      "endTime": "2024-01-15T16:30:00.000Z",
      "duration": 9000,
      "isRunning": false,
      "hourlyRateSnapshot": 90.00
    }
  }
  ```

### Get Current Running Entry
- **GET** `/time-entries/current`
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
    }
  }
  ```
- **Success Response (200) - No running entry:**
  ```json
  null
  ```

### Create Manual Time Entry
- **POST** `/time-entries`
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
- **Validation:**
  - `description`: Optional string
  - `startTime`: Required ISO datetime
  - `endTime`: Required ISO datetime (must be after startTime)
  - `projectId`: Optional, valid project UUID owned by user
  - `taskId`: Optional, valid task UUID owned by user
- **Success Response (201):** Same format as time entry in list

### Update Time Entry
- **PUT** `/time-entries/:id`
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
- **Validation:** Same as create manual entry, all fields optional
- **Success Response (200):** Same format as time entry in list

### Delete Time Entry
- **DELETE** `/time-entries/:id`
- **Description:** Delete a time entry
- **Headers:** `Authorization: Bearer <token>`
- **URL Parameters:** `id` - Time Entry UUID
- **Success Response (200):**
  ```json
  {
    "message": "Time entry deleted successfully"
  }
  ```

## Reports

### Get Summary Report
- **GET** `/reports/summary`
- **Description:** Get aggregated time tracking summary
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO datetime format)
  - `endDate` (optional): End date (ISO datetime format)
  - `projectId` (optional): Filter by project ID
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
        }
      ],
      "dailyBreakdown": [
        {
          "date": "2024-01-15",
          "totalDuration": 28800,
          "totalEarnings": 720.00,
          "entryCount": 3
        }
      ]
    }
  }
  ```

### Get Detailed Report
- **GET** `/reports/detailed`
- **Description:** Get detailed time entries with full information
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO datetime format)
  - `endDate` (optional): End date (ISO datetime format)
  - `projectId` (optional): Filter by project ID
  - `taskId` (optional): Filter by task ID
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
- **GET** `/reports/projects`
- **Description:** Get time tracking report grouped by projects
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO datetime format)
  - `endDate` (optional): End date (ISO datetime format)
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
- **GET** `/reports/time`
- **Description:** Get time-based analytics and trends
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `startDate` (optional): Start date (ISO datetime format)
  - `endDate` (optional): End date (ISO datetime format)
  - `groupBy` (optional): Group by 'day', 'week', or 'month' (default: 'day')
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
    "status": "OK",
    "timestamp": "2024-01-15T16:30:00.000Z",
    "uptime": 86400,
    "environment": "development"
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
  "error": "You already have a running time entry. Please stop it first."
}
```

### 413 Request Entity Too Large
```json
{
  "error": "Request entity too large",
  "message": "Request size exceeds the limit of 1mb",
  "maxSize": "1mb"
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
  name: string;                  // Full name
  email: string;                 // Unique email address
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
  isActive: boolean;             // Whether project is active
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
  _count?: {                     // Count of related records (when included)
    tasks: number;
    timeEntries: number;
  };
}
```

### Task
```typescript
interface Task {
  id: string;                    // UUID
  name: string;                  // Task name
  description?: string;          // Optional description
  isCompleted: boolean;          // Whether task is completed
  hourlyRate?: number;           // Task-specific hourly rate
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
  isRunning: boolean;            // Whether entry is currently running
  hourlyRateSnapshot?: number;   // Rate at time of creation
  projectId?: string;            // Optional project ID
  taskId?: string;               // Optional task ID
  userId: string;                // Owner user ID
  createdAt: string;             // ISO date string
  updatedAt: string;             // ISO date string
  project?: {                    // Populated project data (when included)
    id: string;
    name: string;
    color?: string;
  };
  task?: {                       // Populated task data (when included)
    id: string;
    name: string;
  };
}
```

## Rate Limiting
- **Default:** 1000 requests per 15 minutes per IP
- **Headers Included:**
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

## CORS
- **Development:** Allows all origins for easier testing
- **Production:** Configure specific allowed origins via `ALLOWED_ORIGINS` environment variable
- **Default allowed origins:**
  - `http://localhost:3010` (Web UI)
  - `http://localhost:5173` (Vite dev server for Electron)
  - `http://localhost:3011` (API direct access)

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
- **Refresh:** Use `/auth/refresh` endpoint

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
    "pages": 3
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

## Real-time Updates

The API supports real-time updates via Socket.IO:

### Connection
- Connect to the Socket.IO server at the same base URL
- Join your user room: `socket.emit('join-user-room', userId)`

### Events Emitted
- `project-created`: When a new project is created
- `task-created`: When a new task is created
- `time-entry-started`: When a time entry is started
- `time-entry-stopped`: When a time entry is stopped
- `time-entry-updated`: When a time entry is updated

## Security Features

### Input Sanitization
- XSS protection with configurable aggressive mode
- SQL injection prevention
- Request size limiting with per-route customization
- Parameter pollution protection

### Headers
- Helmet.js security headers
- Content Security Policy (CSP)
- HSTS in production
- Frame denial protection

### Environment Variables
- `ENABLE_AGGRESSIVE_XSS_PROTECTION`: Enable/disable aggressive XSS protection
- `CSP_REPORT_ONLY`: Set CSP to report-only mode
- `CSP_ALLOWED_DOMAINS`: Additional domains for CSP connect-src
- `REQUEST_SIZE_*`: Per-route request size limits

## Interactive API Documentation
Visit `http://localhost:3011/api-docs` when the server is running for interactive Swagger documentation with live testing capabilities.

## Changelog

### Version 1.0.0
- Initial API release with comprehensive time tracking features
- JWT authentication with captcha protection
- Project and task management
- Time tracking with start/stop functionality
- Advanced reporting and analytics
- Real-time updates via Socket.IO
- Comprehensive security measures
- Rate limiting and input sanitization