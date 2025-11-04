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

test('browser_get_selector works with pre-existing JavaScript-rendered content', async ({ client, server }) => {
  // This tests the scenario where the page loads with JavaScript that immediately
  // renders content to the DOM
  server.setContent('/', `
    <div id="app"></div>
    <script>
      // Immediately render content via JavaScript (simulating a React/Vue app)
      const app = document.getElementById('app');
      const button = document.createElement('button');
      button.id = 'js-rendered-button';
      button.className = 'dynamic-btn';
      button.textContent = 'JS Rendered Button';
      app.appendChild(button);
    </script>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  // Wait for the JavaScript-rendered content to be visible
  await client.callTool({
    name: 'browser_wait_for',
    arguments: {
      selector: '#js-rendered-button',
    },
  });

  // Get snapshot - should include the JS-rendered content
  const snapshotResponse = parseResponse(await client.callTool({
    name: 'browser_snapshot',
  }));

  const pageState = snapshotResponse?.pageState || '';
  console.log('Page State:', pageState);

  // Find the JS-rendered button
  const buttonMatch = pageState.match(/button.*\[ref=([^\]]+)\]/i);
  const buttonRef = buttonMatch ? buttonMatch[1] : null;

  expect(buttonRef).toBeTruthy();

  // Get selector for the JavaScript-rendered element
  const response = parseResponse(await client.callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: buttonRef!,
    },
  }));

  expect(response.result).toContain('CSS Selector:');
  expect(response.result).toContain('XPath:');

  // The selector should reference the JavaScript-rendered button
  const cssMatch = response.result.match(/CSS Selector: (.+)/);
  const xpathMatch = response.result.match(/XPath: (.+)/);

  expect(cssMatch).toBeTruthy();
  expect(xpathMatch).toBeTruthy();

  console.log('CSS Selector:', cssMatch?.[1]);
  console.log('XPath:', xpathMatch?.[1]);

  // The selectors should work for locating the element
  expect(cssMatch?.[1] || xpathMatch?.[1]).toBeTruthy();
});
