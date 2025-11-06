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

/**
 * Example usage of the compression module
 *
 * This file demonstrates how to use the compression functionality.
 * Uses Claude Haiku 4.5 for cost-effective intelligent compression.
 *
 * To run this example:
 *
 * Option 1: Using OAuth (Recommended) ⭐
 * 1. Install Claude Agent SDK (optional dependency):
 *    npm install @anthropic-ai/claude-agent-sdk
 *
 * 2. Set your OAuth token:
 *    export CLAUDE_CODE_OAUTH_TOKEN='your-oauth-token-here'
 *    (Get token by running: claude setup-token)
 *
 * Option 2: Using AWS Bedrock
 * 1. Install the AWS SDK (optional dependency):
 *    npm install @aws-sdk/client-bedrock-runtime
 *
 * 2. Set your AWS bearer token:
 *    export AWS_BEARER_TOKEN_BEDROCK='your-token-here'
 *
 * 3. Run with tsx or ts-node:
 *    tsx compression.example.ts
 *
 * Note: Content < 4k tokens will be returned directly without compression.
 */

import { compress, compressWithOAuth, compressWithBedrock, isCompressionAvailable } from './compression';

async function main() {
  // Check if compression is available
  const available = await isCompressionAvailable();
  console.log('Compression available:', available);

  if (!available) {
    console.log('No compression provider available');
    console.log('\nOption 1 (Recommended): OAuth');
    console.log('  Install: npm install @anthropic-ai/claude-agent-sdk');
    console.log('  Get token: claude setup-token');
    console.log('  Set token: export CLAUDE_CODE_OAUTH_TOKEN=your-token');
    console.log('\nOption 2: AWS Bedrock');
    console.log('  Install: npm install @aws-sdk/client-bedrock-runtime');
    console.log('  Set token: export AWS_BEARER_TOKEN_BEDROCK=your-token');
    return;
  }

  console.log('Using provider:', process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'OAuth (Claude Agent SDK)' : 'AWS Bedrock');

  // Example: Compress a large browser snapshot
  const sampleSnapshot = `
### Result
Navigation successful

### Ran Playwright code
\`\`\`js
await page.goto('https://example.com/products');
\`\`\`

### Open tabs
- 0: (current) [Example Products] (https://example.com/products)

### Page state
- Page URL: https://example.com/products
- Page Title: Example Products
- Page Snapshot:
\`\`\`yaml
- banner "Cookie Consent" [1]
  - button "Accept All Cookies" [2]
  - button "Reject All" [3]
- navigation "Main Navigation" [4]
  - link "Home" [5]
  - link "Products" [6]
  - link "About" [7]
  - link "Contact" [8]
- main [9]
  - heading "Our Products" [10]
  - list [11]
    - listitem [12]
      - link "Product A" [13]
      - text "$29.99" [14]
      - button "Add to Cart" [15]
    - listitem [16]
      - link "Product B" [17]
      - text "$39.99" [18]
      - button "Add to Cart" [19]
    - listitem [20]
      - link "Product C" [21]
      - text "$49.99" [22]
      - button "Add to Cart" [23]
  - navigation "Pagination" [24]
    - button "Previous" [25]
    - button "1" [26]
    - button "2" [27]
    - button "Next" [28]
- aside "Newsletter Signup" [29]
  - heading "Subscribe to our newsletter" [30]
  - textbox "Email" [31]
  - button "Subscribe" [32]
- aside "Advertisement" [33]
  - text "Special offer! 20% off!" [34]
\`\`\`
`;

  console.log('\nOriginal snapshot length:', sampleSnapshot.length, 'characters');
  console.log('\nCompressing with purpose: "保留网站全部主体内容" (preserve all main content)...\n');

  // Use the unified compress function which will automatically choose OAuth or Bedrock
  const compressed = await compress({
    purpose: '保留网站全部主体内容',
    content: sampleSnapshot,
  });

  console.log('Compressed snapshot length:', compressed.length, 'characters');
  console.log('Compression ratio:', ((1 - compressed.length / sampleSnapshot.length) * 100).toFixed(1) + '%');
  console.log('\nCompressed content:');
  console.log('---');
  console.log(compressed);
  console.log('---');
}

main().catch(console.error);
