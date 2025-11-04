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

import { test, expect, parseResponse } from './fixtures';

test('browser_get_selector returns both CSS and XPath by default', async ({ client, server }) => {
  server.setContent('/', `
    <div id="main">
      <button class="submit-btn">Submit</button>
    </div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  // Get snapshot to obtain ref
  await client.callTool({
    name: 'browser_snapshot',
  });

  // Test default behavior (both CSS and XPath)
  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: 'e2', // button element
    },
  }));

  expect(response.result).toContain('CSS Selector:');
  expect(response.result).toContain('XPath:');
});

test('browser_get_selector returns CSS selector only', async ({ client, server }) => {
  server.setContent('/', `
    <div id="container">
      <input type="text" name="username" />
    </div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_snapshot',
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: 'e2', // input element
      type: 'css',
    },
  }));

  expect(response.result).toBeTruthy();
  expect(response.result).not.toContain('XPath:');
  // CSS selector should contain some form of selector
  expect(typeof response.result).toBe('string');
  expect(response.result.length).toBeGreaterThan(0);
});

test('browser_get_selector returns XPath only', async ({ client, server }) => {
  server.setContent('/', `
    <ul>
      <li>Item 1</li>
      <li id="item2">Item 2</li>
    </ul>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_snapshot',
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: 'e3', // second li element
      type: 'xpath',
    },
  }));

  expect(response.result).toBeTruthy();
  expect(response.result).not.toContain('CSS Selector:');
  // XPath typically starts with /
  expect(response.result).toMatch(/^\/.*$/);
});

test('browser_get_selector throws error for invalid ref', async ({ client, server }) => {
  server.setContent('/', `
    <div>Content</div>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_snapshot',
  });

  const response = await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: 'e999', // non-existent ref
    },
  });

  expect(response.isError).toBe(true);
  expect(response.content[0].text).toContain('not found');
});
