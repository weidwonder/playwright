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

test('browser_get_selector works with dynamically loaded elements', async ({ client, server }) => {
  server.setContent('/', `
    <div id="container">
      <button id="load-btn">Load Content</button>
    </div>
    <script>
      document.getElementById('load-btn').addEventListener('click', () => {
        const newDiv = document.createElement('div');
        newDiv.id = 'dynamic-content';
        newDiv.className = 'loaded-item';
        newDiv.textContent = 'Dynamically Loaded';

        const newButton = document.createElement('button');
        newButton.id = 'dynamic-button';
        newButton.className = 'action-btn';
        newButton.textContent = 'Click Me';
        newDiv.appendChild(newButton);

        document.getElementById('container').appendChild(newDiv);
      });
    </script>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  // Initial snapshot
  await client.callTool({
    name: 'browser_snapshot',
  });

  // Click to load dynamic content
  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Load Content button',
      ref: 'e2',
    },
  });

  // Wait for the dynamic content to appear
  await client.callTool({
    name: 'browser_wait_for',
    arguments: {
      selector: '#dynamic-button',
    },
  });

  // Get new snapshot with dynamic content
  const snapshotResponse = parseResponse(await client.callTool({
    name: 'browser_snapshot',
  }));

  //  Print snapshot to see element refs
  console.log('Page State:', snapshotResponse?.pageState);

  // Find the ref for the dynamic button in the snapshot
  const pageState = snapshotResponse?.pageState || '';
  const dynamicButtonMatch = pageState.match(/\[ref=([^\]]+)\].*Click Me/);
  const dynamicButtonRef = dynamicButtonMatch ? dynamicButtonMatch[1] : null;

  if (!dynamicButtonRef) {
    throw new Error('Could not find dynamic button ref in snapshot: ' + pageState);
  }

  // Try to get selector for dynamically loaded button
  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: dynamicButtonRef,
    },
  }));

  // Verify we got valid selectors
  expect(response.result).toContain('CSS Selector:');
  expect(response.result).toContain('XPath:');

  // The selectors should reference the dynamic elements
  expect(response.result).toMatch(/dynamic-button|action-btn/);
});

test('browser_get_selector works with AJAX loaded elements', async ({ client, server }) => {
  server.setContent('/', `
    <div id="app">
      <button id="fetch-btn">Fetch Data</button>
      <div id="results"></div>
    </div>
    <script>
      document.getElementById('fetch-btn').addEventListener('click', async () => {
        // Simulate AJAX call
        setTimeout(() => {
          const resultDiv = document.getElementById('results');
          resultDiv.innerHTML = '<div class="user-card"><span class="username">John Doe</span><button class="view-profile">View Profile</button></div>';
        }, 100);
      });
    </script>
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

  // Trigger AJAX load
  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Fetch Data button',
      ref: 'e2',
    },
  });

  // Wait for dynamic content
  await client.callTool({
    name: 'browser_wait_for',
    arguments: {
      selector: '.view-profile',
    },
  });

  // Get snapshot with AJAX content
  const snapshotResponse = parseResponse(await client.callTool({
    name: 'browser_snapshot',
  }));

  // Find the ref for the view profile button
  const pageState = snapshotResponse?.pageState || '';
  const buttonMatch = pageState.match(/\[ref=([^\]]+)\].*View Profile/i);
  const buttonRef = buttonMatch ? buttonMatch[1] : null;

  if (!buttonRef) {
    console.log('Page State:', pageState);
    throw new Error('Could not find view profile button ref in snapshot');
  }

  // Get selector for AJAX loaded element
  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: buttonRef,
      type: 'css',
    },
  }));

  expect(response.result).toBeTruthy();
  expect(response.result).toMatch(/view-profile|button/);
});

test('browser_get_selector handles nested dynamic elements', async ({ client, server }) => {
  server.setContent('/', `
    <div id="root">
      <button id="render-btn">Render Component</button>
    </div>
    <script>
      document.getElementById('render-btn').addEventListener('click', () => {
        const component = document.createElement('div');
        component.className = 'component-wrapper';
        component.innerHTML = \`
          <div class="header">
            <h2>Title</h2>
          </div>
          <div class="content">
            <ul class="item-list">
              <li class="item" data-id="1">Item 1</li>
              <li class="item" data-id="2">Item 2</li>
              <li class="item" data-id="3">Item 3</li>
            </ul>
          </div>
        \`;
        document.getElementById('root').appendChild(component);
      });
    </script>
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

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Render Component button',
      ref: 'e2',
    },
  });

  await client.callTool({
    name: 'browser_wait_for',
    arguments: {
      selector: '.item-list',
    },
  });

  const snapshotResponse = parseResponse(await client.callTool({
    name: 'browser_snapshot',
  }));

  // Find a list item ref
  const pageState = snapshotResponse?.pageState || '';
  const itemMatch = pageState.match(/\[ref=([^\]]+)\].*Item \d/i);
  const itemRef = itemMatch ? itemMatch[1] : null;

  if (!itemRef) {
    console.log('Page State:', pageState);
    throw new Error('Could not find list item ref in snapshot');
  }

  // Get selector for a deeply nested dynamic element
  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: itemRef,
    },
  }));

  expect(response.result).toContain('CSS Selector:');
  expect(response.result).toContain('XPath:');

  // Should contain the item class or list reference
  expect(response.result).toMatch(/item|li/i);
});
