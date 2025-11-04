/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './fixtures';

test('browser_network_requests', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="fetch('/json')">Click me</button>
  `, 'text/html');

  server.setContent('/json', JSON.stringify({ name: 'John Doe' }), 'application/json');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me button',
      ref: 'e2',
    },
  });

  await expect.poll(() => client.callTool({
    name: 'browser_network_requests',
  })).toHaveResponse({
    result: expect.stringContaining(`[req_0] [GET] ${`${server.PREFIX}/`} => [200] OK`),
  });

  await expect.poll(() => client.callTool({
    name: 'browser_network_requests',
  })).toHaveResponse({
    result: expect.stringContaining(`[req_1] [GET] ${`${server.PREFIX}/json`} => [200] OK`),
  });
});

test('browser_network_requests with type filter', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="fetch('/api/data')">Fetch API</button>
    <img src="/image.png" />
    <script src="/script.js"></script>
  `, 'text/html');

  server.setContent('/api/data', JSON.stringify({ success: true }), 'application/json');
  server.setContent('/image.png', 'fake-image-data', 'image/png');
  server.setContent('/script.js', 'console.log("test");', 'application/javascript');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Fetch API button',
      ref: 'e2',
    },
  });

  // Test 'all' type (default)
  const allRequests = await client.callTool({
    name: 'browser_network_requests',
    arguments: { type: 'all' },
  });
  expect(allRequests.content[0].text).toContain('[GET]');
  expect(allRequests.content[0].text).toContain('/image.png');
  expect(allRequests.content[0].text).toContain('/script.js');

  // Test 'xhr' type (should only include fetch requests)
  const xhrRequests = await client.callTool({
    name: 'browser_network_requests',
    arguments: { type: 'xhr' },
  });
  expect(xhrRequests.content[0].text).toContain('/api/data');
  expect(xhrRequests.content[0].text).not.toContain('/image.png');
  expect(xhrRequests.content[0].text).not.toContain('/script.js');
});

test('browser_network_request_detail', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'secret' })
      })
    ">Login</button>
  `, 'text/html');

  server.setContent('/api/login', JSON.stringify({ token: 'abc123', success: true }), 'application/json');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Login button',
      ref: 'e2',
    },
  });

  // Wait for the request to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get all requests to find the POST request ID
  const requests = await client.callTool({
    name: 'browser_network_requests',
  });

  // Extract the ID of the POST request
  const requestText = requests.content[0].text;
  const postRequestMatch = requestText.match(/\[(req_\d+)\] \[POST\]/);
  expect(postRequestMatch).toBeTruthy();
  const requestId = postRequestMatch![1];

  // Get detailed information about the request
  const detail = await client.callTool({
    name: 'browser_network_request_detail',
    arguments: { id: requestId },
  });

  const detailText = detail.content[0].text;

  // Verify request details
  expect(detailText).toContain('## Request: POST');
  expect(detailText).toContain('/api/login');
  expect(detailText).toContain('### Request Headers');
  expect(detailText).toContain('content-type: application/json');
  expect(detailText).toContain('### Request Body');
  expect(detailText).toContain('username');
  expect(detailText).toContain('test');

  // Verify response details
  expect(detailText).toContain('### Response: 200 OK');
  expect(detailText).toContain('#### Response Headers');
  expect(detailText).toContain('#### Response Body');
  expect(detailText).toContain('token');
  expect(detailText).toContain('abc123');
  expect(detailText).toContain('success');
});

test('browser_network_request_detail with invalid ID', async ({ client, server }) => {
  server.setContent('/', '<h1>Test Page</h1>', 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const detail = await client.callTool({
    name: 'browser_network_request_detail',
    arguments: { id: 'invalid_id' },
  });

  expect(detail.content[0].text).toContain('Request with ID "invalid_id" not found');
});
