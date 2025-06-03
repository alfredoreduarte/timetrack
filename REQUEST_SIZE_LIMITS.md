# Request Size Limiting & Upload Protection

This document explains the request size limiting and upload protection mechanisms implemented in the TimeTrack API.

## Overview

The API now includes comprehensive request size limiting to protect against:
- **DoS attacks** through large payload submissions
- **JSON bomb attacks** with deeply nested objects
- **Memory exhaustion** from extremely large requests
- **Parameter pollution** attacks
- **Storage abuse** through oversized uploads

## Size Limits by Endpoint

Different endpoints have different size limits based on their expected usage:

| Endpoint Category | Default Limit | Environment Variable | Purpose |
|------------------|---------------|---------------------|---------|
| Authentication (`/auth/*`) | 50KB | `REQUEST_SIZE_AUTH` | Login/register data |
| User Management (`/users/*`) | 100KB | `REQUEST_SIZE_USERS` | Profile updates |
| Projects (`/projects/*`) | 200KB | `REQUEST_SIZE_PROJECTS` | Project data |
| Tasks (`/tasks/*`) | 200KB | `REQUEST_SIZE_PROJECTS` | Task data |
| Time Entries (`/time-entries/*`) | 500KB | `REQUEST_SIZE_TIME_ENTRIES` | Time tracking data |
| Reports (`/reports/*`) | 500KB | `REQUEST_SIZE_TIME_ENTRIES` | Report generation |
| Other endpoints | 1MB | `REQUEST_SIZE_DEFAULT` | General API calls |

## Additional Protections

### JSON Structure Validation
- **Maximum nesting depth**: 20 levels of nested objects/arrays
- **String length limits**: Individual strings cannot exceed 10,000 characters
- **Automatic detection** of suspicious JSON structures

### URL-Encoded Data Protection
- **Parameter limit**: Maximum 1000 parameters per request
- **Size limit**: Configurable via `REQUEST_SIZE_URLENCODED` (default: 1MB)
- **Parameter pollution detection**: Prevents excessive parameter counts

### Content Type Limits
- **Raw data**: Configurable via `REQUEST_SIZE_RAW` (default: 1MB)
- **Text data**: Configurable via `REQUEST_SIZE_TEXT` (default: 100KB)

## Configuration

All size limits can be configured through environment variables:

```bash
# Request size limits
REQUEST_SIZE_AUTH="50kb"
REQUEST_SIZE_TIME_ENTRIES="500kb"
REQUEST_SIZE_PROJECTS="200kb"
REQUEST_SIZE_USERS="100kb"
REQUEST_SIZE_DEFAULT="1mb"
REQUEST_SIZE_URLENCODED="1mb"
REQUEST_SIZE_RAW="1mb"
REQUEST_SIZE_TEXT="100kb"
```

## Error Responses

When size limits are exceeded, the API returns:

```json
{
  "error": "Request entity too large",
  "message": "Request size exceeds the limit of 50kb",
  "maxSize": "50kb"
}
```

For suspicious structures:

```json
{
  "error": "Request structure invalid",
  "message": "Request structure too complex"
}
```

## Monitoring

The system automatically logs:
- **Large requests** (>100KB) for monitoring purposes
- **Rejected requests** with IP addresses and request details
- **Suspicious activity** patterns for security analysis

## Adjusting Limits

To modify limits for production:

1. Update the appropriate environment variable
2. Restart the API server
3. Monitor logs for any legitimate requests being rejected
4. Adjust limits as needed based on actual usage patterns

## Security Benefits

This implementation provides protection against:
- **Denial of Service (DoS)** attacks through payload size
- **Memory exhaustion** attacks
- **JSON bomb** and **billion laughs** style attacks
- **Storage abuse** and **bandwidth abuse**
- **Application layer attacks** targeting specific endpoints