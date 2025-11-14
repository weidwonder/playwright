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
import { elementSchema } from './snapshot';

const pressKey = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_press_key',
    title: 'Press a key',
    description: 'Press a key on the keyboard',
    inputSchema: z.object({
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
      return_snapshot: z.boolean().optional().default(false).describe('Whether to return page snapshot after the action. Default: false. Use browser_snapshot to check results when needed.'),
      compress_with_purpose: z.string().optional().describe('Optional purpose for compressing the snapshot. Only effective when return_snapshot is true. If provided, the response will be compressed using Claude AI to reduce context length while preserving critical information. RECOMMENDED: Generally enable this option with a broad purpose like "保留网站全部主体内容" (preserve all main content) to achieve compression benefits while maintaining comprehensive page visibility. Avoid overly specific purposes as they may filter out important content.'),
    }),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    if (params.return_snapshot) {
      response.setIncludeSnapshot();
      if (params.compress_with_purpose)
        response.setCompressionPurpose(params.compress_with_purpose);
    }

    response.addCode(`// Press ${params.key}`);
    response.addCode(`await page.keyboard.press('${params.key}');`);

    await tab.waitForCompletion(async () => {
      await tab.page.keyboard.press(params.key);
    });
  },
});

const typeSchema = elementSchema.extend({
  text: z.string().describe('Text to type into the element'),
  submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
  slowly: z.boolean().optional().describe('Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.'),
  return_snapshot: z.boolean().optional().default(false).describe('Whether to return page snapshot after the action. Default: false. Use browser_snapshot to check results when needed.'),
  compress_with_purpose: z.string().optional().describe('Optional purpose for compressing the snapshot. Only effective when return_snapshot is true. If provided, the response will be compressed using Claude AI to reduce context length while preserving critical information. RECOMMENDED: Generally enable this option with a broad purpose like "保留网站全部主体内容" (preserve all main content) to achieve compression benefits while maintaining comprehensive page visibility. Avoid overly specific purposes as they may filter out important content.'),
});

const type = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_type',
    title: 'Type text',
    description: 'Type text into editable element',
    inputSchema: typeSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    if (params.return_snapshot) {
      response.setIncludeSnapshot();
      if (params.compress_with_purpose)
        response.setCompressionPurpose(params.compress_with_purpose);
    }

    const { locator, resolved } = await tab.refLocator(params);
    const secret = tab.context.lookupSecret(params.text);

    await tab.waitForCompletion(async () => {
      if (params.slowly) {
        response.addCode(`await page.${resolved}.pressSequentially(${secret.code});`);
        await locator.pressSequentially(secret.value);
      } else {
        response.addCode(`await page.${resolved}.fill(${secret.code});`);
        await locator.fill(secret.value);
      }

      if (params.submit) {
        response.addCode(`await page.${resolved}.press('Enter');`);
        await locator.press('Enter');
      }
    });
  },
});

export default [
  pressKey,
  type,
];
