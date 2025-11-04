# Enhanced Network Request Monitoring for Playwright MCP

## Overview

This document describes the enhanced network request monitoring features added to Playwright MCP. These enhancements enable AI-powered web scraping assistants to analyze HTTP requests in detail, making it easier to understand and replicate login flows, API calls, and other network interactions.

## New Features

### 1. Enhanced `browser_network_requests` Tool

**Changes:**
- Each network request now has a unique ID (e.g., `req_0`, `req_1`, `req_2`)
- Added optional `type` parameter to filter requests:
  - `"xhr"` - Shows only XHR/Fetch requests (useful for API calls)
  - `"all"` - Shows all requests including images, scripts, stylesheets (default)

**Example Usage:**

```javascript
// Get all network requests
await client.callTool({
  name: 'browser_network_requests',
  arguments: {}  // or { type: 'all' }
});

// Output:
// [req_0] [GET] https://example.com/ => [200] OK
// [req_1] [GET] https://example.com/style.css => [200] OK
// [req_2] [POST] https://example.com/api/login => [200] OK
// [req_3] [GET] https://example.com/image.png => [200] OK

// Get only XHR/Fetch requests (API calls)
await client.callTool({
  name: 'browser_network_requests',
  arguments: { type: 'xhr' }
});

// Output:
// [req_2] [POST] https://example.com/api/login => [200] OK
```

### 2. New `browser_network_request_detail` Tool

This new tool allows you to inspect the complete details of any network request by its ID.

**Parameters:**
- `id` (required): The request ID from `browser_network_requests` (e.g., `"req_2"`)

**Returns:**
- Request method and URL
- Request headers (all headers including custom ones)
- Request body/payload (for POST, PUT, etc.)
- Response status and status text
- Response headers
- Response body (formatted JSON for JSON responses)
- Automatic size limiting (bodies over 10KB are omitted with size info)

**Example Usage:**

```javascript
// First, get the list of requests
const requests = await client.callTool({
  name: 'browser_network_requests',
  arguments: { type: 'xhr' }
});

// Then get details for a specific request (e.g., req_2)
const detail = await client.callTool({
  name: 'browser_network_request_detail',
  arguments: { id: 'req_2' }
});

// Output:
// ## Request: POST https://example.com/api/login
//
// ### Request Headers
// content-type: application/json
// accept: application/json
// user-agent: Mozilla/5.0...
//
// ### Request Body
// ```
// {"username":"test@example.com","password":"secret123"}
// ```
//
// ### Response: 200 OK
//
// #### Response Headers
// content-type: application/json
// set-cookie: session=abc123xyz; Path=/; HttpOnly
//
// #### Response Body
// ```json
// {
//   "success": true,
//   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
//   "user": {
//     "id": 12345,
//     "email": "test@example.com"
//   }
// }
// ```
```

## Use Cases

### 1. AI Web Scraping Assistant

**Problem:** You want an AI to analyze a website's login flow and replicate it with direct HTTP requests.

**Solution:**

```javascript
// 1. Navigate to the login page
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com/login' }
});

// 2. Fill in and submit the login form
await client.callTool({
  name: 'browser_type',
  arguments: { element: 'email input', ref: 'e1', text: 'user@test.com' }
});

await client.callTool({
  name: 'browser_type',
  arguments: { element: 'password input', ref: 'e2', text: 'password123' }
});

await client.callTool({
  name: 'browser_click',
  arguments: { element: 'login button', ref: 'e3' }
});

// 3. Get all XHR requests to find the login API call
const requests = await client.callTool({
  name: 'browser_network_requests',
  arguments: { type: 'xhr' }
});

// 4. Extract the login request ID (look for POST to /api/login)
// Assume it's req_5

// 5. Get full details of the login request
const loginDetail = await client.callTool({
  name: 'browser_network_request_detail',
  arguments: { id: 'req_5' }
});

// Now the AI can see:
// - What endpoint was called (/api/login)
// - What headers were sent (Content-Type, CSRF tokens, etc.)
// - What payload format is expected (JSON with username/password)
// - What the response looks like (token, session cookie, etc.)
//
// The AI can now write code to replicate this request:
// ```python
// import requests
//
// response = requests.post('https://example.com/api/login',
//     headers={'Content-Type': 'application/json'},
//     json={'username': 'user@test.com', 'password': 'password123'}
// )
// token = response.json()['token']
// ```
```

### 2. API Discovery and Documentation

**Problem:** Understanding what API calls a web application makes.

**Solution:**

```javascript
// Navigate and interact with the application
await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://app.example.com' }
});

// Perform various actions...

// Get only API calls
const apiCalls = await client.callTool({
  name: 'browser_network_requests',
  arguments: { type: 'xhr' }
});

// Inspect each API call
for (const requestLine of apiCalls.content[0].text.split('\n')) {
  const match = requestLine.match(/\[(req_\d+)\]/);
  if (match) {
    const detail = await client.callTool({
      name: 'browser_network_request_detail',
      arguments: { id: match[1] }
    });
    // Analyze the API structure, parameters, response format
  }
}
```

### 3. Debugging Authentication Issues

**Problem:** A login flow is failing, and you need to see what's being sent.

**Solution:**

```javascript
// After attempting login
const requests = await client.callTool({
  name: 'browser_network_requests',
  arguments: { type: 'xhr' }
});

// Find the failed request (status 401, 403, etc.)
// Get details to see what went wrong
const detail = await client.callTool({
  name: 'browser_network_request_detail',
  arguments: { id: 'req_3' }
});

// Check:
// - Are all required headers present?
// - Is the payload format correct?
// - What error message is the server returning?
```

## Technical Implementation Details

### Files Modified

1. **`packages/playwright/src/mcp/browser/tab.ts`**
   - Added `_requestsWithIds` Map to store requests with IDs
   - Added `_requestIdCounter` to generate unique IDs
   - Added `requestsWithIds()` and `getRequestById()` methods

2. **`packages/playwright/src/mcp/browser/tools/network.ts`**
   - Enhanced `browser_network_requests` with `type` parameter
   - Added new `browser_network_request_detail` tool
   - Added `renderRequestDetail()` function to format detailed output

3. **`tests/mcp/network.spec.ts`**
   - Added comprehensive test coverage for new features
   - Tests for type filtering (xhr vs all)
   - Tests for request detail retrieval
   - Tests for error handling

### Request ID Format

Request IDs follow the format `req_N` where N is a sequential number starting from 0:
- `req_0` - First request after page load/navigation
- `req_1` - Second request
- etc.

IDs are reset when:
- Navigating to a new page
- Page is refreshed
- Tab is closed

### Size Limitations

To prevent context overflow:
- Request bodies larger than 10KB are omitted (size is reported)
- Response bodies larger than 10KB are omitted (size is reported)
- Binary content is not displayed (content type and size are reported)

### Supported Content Types

Response bodies are formatted based on content type:
- `application/json` - Formatted as pretty JSON
- `text/*` - Displayed as plain text
- Binary types - Size and content-type reported only

## Testing

Run the test suite:

```bash
cd /path/to/playwright
npm ci
npm run watch  # In a separate terminal
npx playwright install chromium
npm run ctest-mcp -- tests/mcp/network.spec.ts
```

All tests should pass:
- ✅ browser_network_requests - Basic functionality with IDs
- ✅ browser_network_requests with type filter - XHR vs all filtering
- ✅ browser_network_request_detail - Full request details
- ✅ browser_network_request_detail with invalid ID - Error handling

## Migration Guide

If you were using the old `browser_network_requests` without parameters:

**Before:**
```javascript
const requests = await client.callTool({
  name: 'browser_network_requests'
});
// Output: [GET] https://example.com/ => [200] OK
```

**After:**
```javascript
const requests = await client.callTool({
  name: 'browser_network_requests'
  // Same output, now with IDs:
  // [req_0] [GET] https://example.com/ => [200] OK
});
```

The change is **backward compatible** - existing code will continue to work, you just get IDs added to each line.

## Future Enhancements

Potential improvements for future versions:

1. **Request filtering by pattern**
   - Filter by URL pattern (e.g., `pattern: "*/api/*"`)
   - Filter by status code (e.g., `status: 4xx`)

2. **Request timing information**
   - Time to first byte (TTFB)
   - Total duration
   - DNS lookup, connection, TLS handshake times

3. **Resource type filtering**
   - More granular types (image, stylesheet, script, font, etc.)

4. **Request replay**
   - Tool to replay a request with modifications
   - Useful for testing different payloads

5. **Export to cURL/HTTP format**
   - Generate cURL commands from requests
   - Generate raw HTTP format

## Contributing

This feature is part of the Playwright MCP project. To contribute:

1. Follow the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines
2. Run tests with `npm run ctest-mcp`
3. Run linter with `npm run lint`
4. Follow Semantic Commit Messages format

## License

Copyright (c) Microsoft Corporation. Licensed under the Apache License 2.0.
