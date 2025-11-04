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

import type * as playwright from 'playwright-core';
import type { Request } from '../../../../../playwright-core/src/client/network';

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns all network requests since loading the page. Each request has an ID that can be used with browser_network_request_detail to get more information.',
    inputSchema: z.object({
      type: z.enum(['xhr', 'all']).optional().describe('Filter requests by type. "xhr" includes only XHR/Fetch requests, "all" includes all requests. Default: "all"'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const requestsWithIds = await tab.requestsWithIds();
    const requestType = params.type || 'all';

    for (const [id, request] of requestsWithIds) {
      if (requestType === 'xhr') {
        const resourceType = request.resourceType();
        if (resourceType !== 'xhr' && resourceType !== 'fetch')
          continue;
      }
      response.addResult(await renderRequest(id, request));
    }
  },
});

const requestDetail = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_request_detail',
    title: 'Get network request details',
    description: 'Returns detailed information about a specific network request including headers and body',
    inputSchema: z.object({
      id: z.string().describe('The request ID from browser_network_requests'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const request = tab.getRequestById(params.id);
    if (!request) {
      response.addError(`Request with ID "${params.id}" not found. Use browser_network_requests to get valid IDs.`);
      return;
    }

    const detail = await renderRequestDetail(request);
    response.addResult(detail);
  },
});

async function renderRequest(id: string, request: playwright.Request) {
  const result: string[] = [];
  result.push(`[${id}] [${request.method().toUpperCase()}] ${request.url()}`);
  const hasResponse = (request as Request)._hasResponse;
  if (hasResponse) {
    const response = await request.response();
    if (response)
      result.push(`=> [${response.status()}] ${response.statusText()}`);
  }
  return result.join(' ');
}

async function renderRequestDetail(request: playwright.Request) {
  const result: string[] = [];
  const maxBodySize = 10000; // Maximum body size to include (10KB)

  // Request line
  result.push(`## Request: ${request.method().toUpperCase()} ${request.url()}`);
  result.push('');

  // Request headers
  result.push('### Request Headers');
  const requestHeaders = request.headers();
  for (const [key, value] of Object.entries(requestHeaders)) {
    result.push(`${key}: ${value}`);
  }
  result.push('');

  // Request body
  const postData = request.postData();
  if (postData) {
    result.push('### Request Body');
    if (postData.length > maxBodySize) {
      result.push(`(Body too large: ${postData.length} bytes, omitted)`);
    } else {
      result.push('```');
      result.push(postData);
      result.push('```');
    }
    result.push('');
  }

  // Response
  const hasResponse = (request as Request)._hasResponse;
  if (hasResponse) {
    const response = await request.response();
    if (response) {
      result.push(`### Response: ${response.status()} ${response.statusText()}`);
      result.push('');

      // Response headers
      result.push('#### Response Headers');
      const responseHeaders = response.headers();
      for (const [key, value] of Object.entries(responseHeaders)) {
        result.push(`${key}: ${value}`);
      }
      result.push('');

      // Response body
      try {
        const body = await response.body();
        if (body) {
          result.push('#### Response Body');
          if (body.length > maxBodySize) {
            result.push(`(Body too large: ${body.length} bytes, omitted)`);
          } else {
            const contentType = responseHeaders['content-type'] || '';
            const bodyText = body.toString('utf-8');

            // Format JSON responses
            if (contentType.includes('application/json')) {
              result.push('```json');
              try {
                result.push(JSON.stringify(JSON.parse(bodyText), null, 2));
              } catch {
                result.push(bodyText);
              }
              result.push('```');
            } else if (contentType.includes('text/')) {
              result.push('```');
              result.push(bodyText);
              result.push('```');
            } else {
              result.push(`(Binary content: ${body.length} bytes, content-type: ${contentType})`);
            }
          }
        }
      } catch (e) {
        result.push('(Response body not available)');
      }
    }
  }

  return result.join('\n');
}

export default [
  requests,
  requestDetail,
];
