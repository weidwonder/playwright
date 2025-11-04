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

import { z } from '../../sdk/bundle';
import { defineTabTool } from './tool';
import { cssPath, xPath } from 'playwright-dompath';

const getSelector = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_get_selector',
    title: 'Get element selector',
    description: 'Get CSS selector or XPath for an element using its ref from page snapshot',
    inputSchema: z.object({
      ref: z.string().describe('Exact target element reference from the page snapshot'),
      type: z.enum(['css', 'xpath', 'both']).optional().describe('Type of selector to return: "css" for CSS selector, "xpath" for XPath, or "both" (default)'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    // Resolve the ref to a locator without element description
    const locator = tab.page.locator(`aria-ref=${params.ref}`);

    // Verify the element exists
    try {
      await locator._resolveSelector();
    } catch (e) {
      throw new Error(`Ref ${params.ref} not found in the current page snapshot. Try capturing new snapshot.`);
    }

    const type = params.type || 'both';
    const result: { css?: string; xpath?: string } = {};

    try {
      if (type === 'css' || type === 'both') {
        result.css = await cssPath(locator);
      }

      if (type === 'xpath' || type === 'both') {
        result.xpath = await xPath(locator);
      }

      // Format the response
      if (type === 'both') {
        response.addResult(`CSS Selector: ${result.css}\nXPath: ${result.xpath}`);
      } else if (type === 'css') {
        response.addResult(result.css!);
      } else {
        response.addResult(result.xpath!);
      }
    } catch (e) {
      throw new Error(`Failed to generate selector for ref ${params.ref}: ${(e as Error).message}`);
    }
  },
});

export default [
  getSelector,
];
