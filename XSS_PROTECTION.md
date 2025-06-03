# XSS Protection & Input Sanitization

This document explains the cross-site scripting (XSS) protection mechanisms implemented in the TimeTrack API.

## Overview

The API now includes comprehensive XSS protection through:
- **Input sanitization** of user-submitted data
- **Content Security Policy (CSP)** headers
- **Enhanced security headers** via Helmet.js
- **Configurable protection levels** for different environments

## Input Sanitization

### What Gets Sanitized

The system automatically sanitizes specific fields that are likely to be displayed in the UI:

- `name` - Project names, user names, etc.
- `description` - Project and task descriptions
- `title` - Task titles, report titles
- `comment` - User comments
- `notes` - Additional notes
- `tags` - Tag values
- `label` - Display labels
- `displayName` - Display names

### Sanitization Process

1. **HTML Tag Removal**: All HTML tags are stripped from input
2. **Attribute Cleaning**: All HTML attributes are removed
3. **XSS Pattern Detection**: Common XSS vectors are identified and removed:
   - `javascript:` URLs
   - `data:` URLs (except safe image base64)
   - `vbscript:` URLs
   - Event handlers (`onClick`, `onLoad`, etc.)
   - `<` and `>` characters
4. **Whitespace Normalization**: Multiple spaces are normalized

### Example

```javascript
// Input
"<script>alert('xss')</script>Hello <b>World</b>"

// Output
"Hello World"
```

## Content Security Policy (CSP)

### Configuration

CSP is configured through environment variables:

```bash
# CSP Configuration
CSP_REPORT_ONLY=true
CSP_ALLOWED_DOMAINS=localhost:3010,localhost:3011
ENABLE_AGGRESSIVE_XSS_PROTECTION=false
```

### CSP Directives

| Directive | Policy | Purpose |
|-----------|--------|---------|
| `default-src` | 'self' | Only allow resources from same origin |
| `script-src` | 'self' + dev exceptions | Prevent script injection |
| `style-src` | 'self' + 'unsafe-inline' | Allow styles (minimal inline for UI) |
| `img-src` | 'self', data:, https: | Allow images from safe sources |
| `connect-src` | 'self' + configured domains | Restrict AJAX/fetch requests |
| `frame-src` | 'none' | Prevent clickjacking |
| `object-src` | 'none' | Block plugins |
| `base-uri` | 'self' | Prevent base tag injection |

### Development vs Production

**Development Mode:**
- CSP runs in `reportOnly` mode by default
- Additional script sources allowed for Swagger UI
- More permissive for debugging

**Production Mode:**
- CSP actively blocks violations
- Strict HTTPS enforcement
- Minimal allowed sources

## Security Headers

### Helmet.js Configuration

| Header | Setting | Protection |
|--------|---------|------------|
| `X-XSS-Protection` | Enabled | Browser XSS filtering |
| `X-Content-Type-Options` | nosniff | MIME type sniffing prevention |
| `X-Frame-Options` | DENY | Clickjacking prevention |
| `Strict-Transport-Security` | 1 year | HTTPS enforcement |
| `Referrer-Policy` | strict-origin-when-cross-origin | Referrer information control |
| `Cross-Origin-Embedder-Policy` | require-corp (prod) | Cross-origin isolation |

## Monitoring & Logging

### Sanitization Events

The system logs when sanitization occurs:

```json
{
  "type": "field_sanitized",
  "field": "description",
  "path": "/projects",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2023-12-20T10:30:00.000Z"
}
```

### XSS Protection Status

System startup logs XSS protection configuration:

```json
{
  "type": "xss_protection_enabled",
  "csp_report_only": true,
  "aggressive_sanitization": false,
  "allowed_csp_domains": "localhost:3010,localhost:3011",
  "timestamp": "2023-12-20T10:00:00.000Z"
}
```

## Configuration Options

### Environment Variables

```bash
# Basic XSS Protection
CSP_REPORT_ONLY=true                    # CSP enforcement mode
CSP_ALLOWED_DOMAINS=domain1,domain2     # Allowed connection domains
ENABLE_AGGRESSIVE_XSS_PROTECTION=false  # Apply sanitization to all fields

# Request Size Limits (related security)
REQUEST_SIZE_AUTH=50kb
REQUEST_SIZE_PROJECTS=200kb
REQUEST_SIZE_USERS=100kb
REQUEST_SIZE_DEFAULT=1mb
```

### Production Recommendations

For production environments:

```bash
CSP_REPORT_ONLY=false
CSP_ALLOWED_DOMAINS=yourdomain.com,api.yourdomain.com
ENABLE_AGGRESSIVE_XSS_PROTECTION=true
NODE_ENV=production
```

## Testing XSS Protection

### Manual Testing

1. **Input Sanitization Test:**
   ```bash
   curl -X POST http://localhost:3011/projects \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"name": "<script>alert(\"xss\")</script>Test Project"}'
   ```

2. **CSP Header Verification:**
   ```bash
   curl -I http://localhost:3011/health
   ```
   Look for `Content-Security-Policy` header.

### Expected Behavior

- Malicious scripts in input fields are stripped
- CSP headers prevent script injection
- Sanitization events are logged
- UI displays clean, safe content

## Security Benefits

This implementation protects against:

- **Stored XSS**: Malicious scripts saved in database
- **Reflected XSS**: Scripts in URL parameters or form data
- **DOM-based XSS**: Client-side script manipulation
- **Clickjacking**: UI redressing attacks
- **MIME sniffing attacks**: Content type confusion
- **Protocol downgrade attacks**: HTTPS bypass attempts

## Troubleshooting

### Common Issues

1. **CSP Blocking Legitimate Resources:**
   - Add domains to `CSP_ALLOWED_DOMAINS`
   - Check browser console for CSP violations

2. **Overly Aggressive Sanitization:**
   - Review `fieldsToSanitize` array in middleware
   - Consider domain-specific sanitization rules

3. **Swagger UI Not Loading:**
   - Ensure development mode allows unsafe-inline
   - Check CSP configuration for swagger domains

### Debug Mode

Enable detailed logging in development:

```bash
LOG_LEVEL=debug
CSP_REPORT_ONLY=true
```

This will log all sanitization events and CSP violations.