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
import * as javascript from '../codegen';

import type { Tab } from '../tab';

const evaluateSchema = z.object({
  function: z.string().describe('() => { /* code */ } or (element) => { /* code */ } when element is provided'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().optional().describe('Exact target element reference from the page snapshot'),
  return_snapshot: z.boolean().optional().default(false).describe('Whether to return page snapshot after the action. Default: false. Use browser_snapshot to check results when needed.'),
  compress_with_purpose: z.string().optional().describe('Optional purpose for compressing the snapshot. Only effective when return_snapshot is true. If provided, the response will be compressed using Claude AI to reduce context length while preserving critical information. RECOMMENDED: Generally enable this option with a broad purpose like "保留网站全部主体内容" (preserve all main content) to achieve compression benefits while maintaining comprehensive page visibility. Avoid overly specific purposes as they may filter out important content.'),
});

const evaluate = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_evaluate',
    title: 'Evaluate JavaScript',
    description: 'Evaluate JavaScript expression on page or element',
    inputSchema: evaluateSchema,
    type: 'action',
  },

  handle: async (tab, params, response) => {
    if (params.return_snapshot) {
      response.setIncludeSnapshot();
      if (params.compress_with_purpose)
        response.setCompressionPurpose(params.compress_with_purpose);
    }

    let locator: Awaited<ReturnType<Tab['refLocator']>> | undefined;
    if (params.ref && params.element) {
      locator = await tab.refLocator({ ref: params.ref, element: params.element });
      response.addCode(`await page.${locator.resolved}.evaluate(${javascript.quote(params.function)});`);
    } else {
      response.addCode(`await page.evaluate(${javascript.quote(params.function)});`);
    }

    await tab.waitForCompletion(async () => {
      const receiver = locator?.locator ?? tab.page;
      const result = await receiver._evaluateFunction(params.function);
      response.addResult(JSON.stringify(result, null, 2) || 'undefined');
    });
  },
});

export default [
  evaluate,
];
