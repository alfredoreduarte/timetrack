# TimeTrack API

A comprehensive time tracking REST API built with Node.js, TypeScript, and SQLite. Similar to Toggl, providing project management, time tracking, and reporting capabilities.

## Features

- 🔐 **JWT Authentication** - Secure user registration and login
- 📊 **Project Management** - Create and organize projects with custom colors and hourly rates
- ✅ **Task Management** - Break down projects into manageable tasks
- ⏱️ **Time Tracking** - Start/stop timers with real-time tracking
- 📈 **Reporting** - Comprehensive time and earnings reports
- 💰 **Hierarchical Hourly Rates** - Task > Project > User default rates
- 📝 **Manual Time Entries** - Add time entries manually
- 🔍 **Filtering & Pagination** - Advanced querying capabilities
- 📚 **API Documentation** - Interactive Swagger documentation

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd timetrack-api
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=development
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Documentation

- **Interactive Docs**: http://localhost:3000/api-docs
- **Health Check**: http://localhost:3000/health
- **Detailed Documentation**: See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## Project Structure

```
src/
├── controllers/     # Request handlers
├── middleware/      # Custom middleware (auth, validation)
├── models/         # Database models and schemas
├── routes/         # API route definitions
├── services/       # Business logic layer
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
├── database.ts     # Database connection and setup
└── server.ts       # Application entry point
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests (when implemented)

## API Endpoints Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project by ID
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Time Entries
- `GET /api/time-entries` - List time entries
- `POST /api/time-entries` - Create manual time entry
- `POST /api/time-entries/start` - Start timer
- `POST /api/time-entries/:id/stop` - Stop timer
- `GET /api/time-entries/current` - Get current running timer
- `PUT /api/time-entries/:id` - Update time entry
- `DELETE /api/time-entries/:id` - Delete time entry

### Reports
- `GET /api/reports/summary` - Get time and earnings summary

## Database

This project uses SQLite with a simple file-based database (`timetrack.db`). The database is automatically created and initialized when the server starts.

### Schema Overview

- **users** - User accounts and authentication
- **projects** - Project information and settings
- **tasks** - Tasks belonging to projects
- **time_entries** - Time tracking records

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Development

### Adding New Features

1. Create model in `src/models/`
2. Add routes in `src/routes/`
3. Implement controller in `src/controllers/`
4. Add business logic in `src/services/`
5. Update documentation

### Environment Variables

- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - Environment (development/production)

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Set production environment variables
3. Start the server:
```bash
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or issues, please create an issue in the repository or contact the development team.

---

**Built with ❤️ using Node.js, TypeScript, and SQLite**
