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

import { debug, dotenv } from 'playwright-core/lib/utilsBundle';
import * as path from 'path';
import * as fs from 'fs';

const compressionDebug = debug('pw:mcp:compression');

// Rough estimation: 1 token ≈ 4 characters for English text
// For mixed content (code, Chinese, etc.), this is a conservative estimate
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// Load .env file if it exists
function loadDotEnv() {
  // Try to find .env in current directory or parent directories
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      compressionDebug('Loading .env from:', envPath);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const parsed = dotenv.parse(envContent);
      // Only set if not already set
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key])
          process.env[key] = value;
      }
      return;
    }
    currentDir = path.dirname(currentDir);
  }
}

// Load .env on module initialization
loadDotEnv();

const COMPRESSION_PROMPT = `# Browser Tool Proxy Sub-Agent

Execute \`browser_navigate()\` and \`browser_snapshot()\` calls, then filter Playwright snapshot outputs to reduce context length while preserving all critical crawling elements.

## Input

Commands: \`navigate\` (with URL) or \`snapshot\` (current page)
Optional context: What data researcher is looking for

## Core Responsibility

Filter Playwright snapshots:
- **KEEP:** Main content, data elements, interactive controls, ALL refs \`[N]\`, element attributes, text content
- **REMOVE:** Ads, cookie banners, tracking scripts, analytics, unrelated navigation

**Note:** Playwright snapshots are structured DOM representations with ref numbers \`[N]\`, NOT raw HTML.

## What to Keep/Remove

### Navigation Output
**Keep:** Final URL, HTTP status, page title, success/failure, auth challenges, errors
**Remove:** Verbose headers, tracking data

### Snapshot Output

**Keep:**
- Main content (products, articles, listings, search results)
- Interactive elements (buttons, tabs, filters, forms, pagination)
- Authentication elements (login, user menus)
- Website-specific UI, breadcrumbs
- ALL ref numbers \`[N]\`, attributes (\`class\`, \`id\`, \`data-*\`, \`aria-*\`, \`href\`, \`src\`), text content

**Remove:**
- Cookie/privacy banners, ads, analytics/tracking scripts
- Social media widgets, site-wide navigation (if unrelated)
- Newsletter forms (unless target data), promotional banners, third-party embeds

**Always keep:** Login forms, auth warnings, CAPTCHAs, rate limit messages, error pages, loading indicators, "load more" buttons, empty states

## Output Format

**Navigation:** Plain text with status, final URL, page title, HTTP status, critical notes

**Snapshot:** Return filtered Playwright snapshot structure directly with irrelevant sections removed. Do NOT summarize.

## Example

**Input:** Product page with cookie banner, header nav, product grid, pagination, newsletter popup, tracking scripts

**Output:** Product grid (with all product cards, refs, attributes) + pagination controls only

**Removed:** Cookie banner, header, newsletter, scripts
**Kept:** All main content, refs \`[N]\`, attributes, text, pagination

## Decision Guide

**Keep if:** Contains/controls target data, auth-related, shows loading/error states, has usable ref \`[N]\`

**Remove if:** Cookies, global nav, ads, social widgets, newsletters (unless target), analytics, third-party widgets

**When in doubt, KEEP IT.**

## Target

Reduce output to ~40-70% of original length while preserving all critical crawling information.
Return no more than 10K tokens.`;

interface CompressionOptions {
  purpose?: string;
  content: string;
  modelId?: string;
  region?: string;
}

/**
 * Compress browser output using Claude Agent SDK (OAuth)
 */
export async function compressWithOAuth(options: CompressionOptions): Promise<string> {
  const { purpose, content } = options;

  try {
    // Check if OAuth token is available
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!oauthToken) {
      compressionDebug('CLAUDE_CODE_OAUTH_TOKEN not found in environment, skipping compression');
      return content;
    }

    compressionDebug('OAuth token found, length:', oauthToken.length);

    // Dynamically import Claude Agent SDK to avoid bundling issues
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const query = sdk.query;

    if (!query) {
      compressionDebug('Claude Agent SDK query function not available, skipping compression');
      return content;
    }

    const userMessage = purpose
      ? `${COMPRESSION_PROMPT}\n\nPurpose: ${purpose}\n\nContent to compress:\n\n${content}`
      : `${COMPRESSION_PROMPT}\n\nContent to compress:\n\n${content}`;

    compressionDebug('Compressing content with Claude Agent SDK (OAuth), purpose:', purpose || 'none');

    // Use Claude Agent SDK to make the API call with OAuth token
    const response = query({
      prompt: userMessage,
    });

    let compressedResult = '';
    for await (const message of response) {
      // Collect the assistant's response
      if (message.type === 'assistant') {
        if (message.message.content?.[0]?.type === 'text') {
          compressedResult = message.message.content[0].text || '';
          break;
        }
      }
    }

    if (compressedResult) {
      compressionDebug('Compression complete. Original length:', content.length, 'Compressed length:', compressedResult.length);
      return compressedResult;
    }

    compressionDebug('No valid response from Claude Agent SDK, returning original content');
    return content;
  } catch (error: any) {
    compressionDebug('OAuth compression failed:', error?.message || String(error));
    // If compression fails, return original content
    return content;
  }
}

/**
 * Compress browser output using AWS Bedrock Haiku 4.5
 */
export async function compressWithBedrock(options: CompressionOptions): Promise<string> {
  const { purpose, content, modelId = 'global.anthropic.claude-haiku-4-5-20251001-v1:0', region = 'us-east-1' } = options;

  try {
    // Check if bearer token is available
    const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    if (!bearerToken) {
      compressionDebug('AWS_BEARER_TOKEN_BEDROCK not found in environment, skipping compression');
      return content;
    }

    compressionDebug('Bearer token found, length:', bearerToken.length);

    // Dynamically import AWS SDK to avoid bundling issues
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const client = new BedrockRuntimeClient({ region });

    const userMessage = purpose
      ? `Purpose: ${purpose}\n\nContent to compress:\n\n${content}`
      : `Content to compress:\n\n${content}`;

    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: [
            { text: COMPRESSION_PROMPT },
            { text: userMessage },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 10000,
      },
    });

    compressionDebug('Compressing content with Bedrock Haiku 4.5, purpose:', purpose || 'none');
    const response = await client.send(command);

    if (response.output?.message?.content?.[0]) {
      const compressed = (response.output.message.content[0] as any).text || '';
      compressionDebug('Compression complete. Original length:', content.length, 'Compressed length:', compressed.length);
      return compressed;
    }

    compressionDebug('No valid response from Bedrock, returning original content');
    return content;
  } catch (error: any) {
    compressionDebug('Compression failed:', error?.message || String(error));
    // If compression fails, return original content
    return content;
  }
}

/**
 * Compress browser output with fallback strategy:
 * 1. Check if content is less than 4k tokens - if so, skip compression
 * 2. Try OAuth (Claude Agent SDK) first
 * 3. Fall back to Bedrock if OAuth fails
 * 4. Return original content if both fail
 */
export async function compress(options: CompressionOptions): Promise<string> {
  const { content } = options;

  // Skip compression if content is already small (< 4k tokens)
  const estimatedTokens = estimateTokenCount(content);
  if (estimatedTokens < 4000) {
    compressionDebug(`Content is small (${estimatedTokens} tokens < 4000), skipping compression`);
    return content;
  }

  compressionDebug(`Content size: ${estimatedTokens} tokens, proceeding with compression`);

  // Try OAuth first
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    compressionDebug('Using OAuth compression provider');
    const result = await compressWithOAuth(options);
    // If compression succeeded (content changed), return result
    if (result !== content) {
      return result;
    }
  }

  // Fall back to Bedrock
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    compressionDebug('Falling back to Bedrock compression provider');
    const result = await compressWithBedrock(options);
    return result;
  }

  // No compression available
  compressionDebug('No compression provider available, returning original content');
  return content;
}

/**
 * Check if compression is available (OAuth or AWS SDK installed and credentials configured)
 */
export async function isCompressionAvailable(): Promise<boolean> {
  // Check OAuth token
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    try {
      await import('@anthropic-ai/claude-agent-sdk');
      return true;
    } catch {
      // Continue to check Bedrock
    }
  }

  // Check Bedrock token
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    try {
      await import('@aws-sdk/client-bedrock-runtime');
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
