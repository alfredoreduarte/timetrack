# CORS Configuration Guide

## ✅ CORS Issue Fixed!

The TimeTrack API has been updated to properly handle CORS requests from frontend applications.

## Current Configuration

### Allowed Origins
The API now accepts requests from:
- `http://localhost:3000` - API server itself
- `http://localhost:5173` - Vite dev server (Electron frontend)
- `http://localhost:3001` - Alternative frontend port

### Allowed Methods
- `GET`, `HEAD`, `PUT`, `PATCH`, `POST`, `DELETE`, `OPTIONS`

### Allowed Headers
- `Content-Type`
- `Authorization`
- `X-Requested-With`
- `Accept`
- `Origin`

### Development Mode
In development (`NODE_ENV=development`), the API allows **all origins** for easier testing and development.

## Environment Configuration

Create a `.env` file with:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here

# CORS Configuration (optional - defaults are set)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:3001

# Rate Limiting Configuration
DISABLE_RATE_LIMIT=true                    # Disable rate limiting for development
RATE_LIMIT_WINDOW_MS=900000               # 15 minutes (optional)
RATE_LIMIT_MAX_REQUESTS=1000              # Max requests per window (optional)
```

## Rate Limiting

### Development Settings
- **Default**: 1000 requests per 15 minutes in development
- **Disable completely**: Set `DISABLE_RATE_LIMIT=true` in your `.env` file
- **Custom limits**: Set `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`

### Production Settings
- **Default**: 100 requests per 15 minutes
- **Always enabled** in production for security

### Fix "429 Too Many Requests" Error

If you're getting rate limit errors during development, add this to your `.env` file:

```env
DISABLE_RATE_LIMIT=true
```

Then restart the server.

## Testing CORS

### ✅ This should now work from your Electron frontend:

```javascript
// From http://localhost:5173
fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User'
  })
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));
```

### ✅ Authenticated requests:

```javascript
// With JWT token
fetch('http://localhost:3000/api/projects', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${yourJwtToken}`
  }
})
.then(response => response.json())
.then(data => console.log('Projects:', data));
```

## Production Configuration

For production, update your environment variables:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

## Troubleshooting

### Still getting CORS errors?

1. **Check the browser console** for the exact error message
2. **Verify your frontend is running on** `http://localhost:5173`
3. **Restart the API server** after making changes
4. **Check the request origin** in browser dev tools

### Common Issues:

- **Wrong port**: Make sure your frontend is on port 5173
- **HTTPS vs HTTP**: Ensure both frontend and API use the same protocol
- **Credentials**: The API supports credentials, so you can include cookies

### Debug CORS:

Add this to your frontend to debug:

```javascript
fetch('http://localhost:3000/health', {
  method: 'GET',
  mode: 'cors',
  credentials: 'include'
})
.then(response => {
  console.log('CORS Headers:', response.headers);
  return response.json();
})
.then(data => console.log('Health check:', data));
```

## Need to add more origins?

Update the `ALLOWED_ORIGINS` environment variable:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,https://myapp.com
```

Or modify `src/server.ts` directly in the `allowedOrigins` array.

---

**The CORS configuration is now properly set up for your Electron frontend! 🎉**