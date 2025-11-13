# 压缩功能关键代码片段详解

## 1. Response 类中的压缩处理

### 文件路径
`/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/response.ts`

### 1.1 成员变量 (第 27-39 行)
```typescript
export class Response {
  private _result: string[] = [];
  private _code: string[] = [];
  private _images: { contentType: string, data: Buffer }[] = [];
  private _context: Context;
  private _includeSnapshot: 'none' | 'full' | 'incremental' = 'none';
  private _includeTabs = false;
  private _tabSnapshot: TabSnapshot | undefined;
  private _compressionPurpose: string | undefined;  // <-- 压缩目的存储位置
  
  readonly toolName: string;
  readonly toolArgs: Record<string, any>;
  private _isError: boolean | undefined;
}
```

### 1.2 setCompressionPurpose 方法 (第 88-90 行)
```typescript
setCompressionPurpose(purpose: string) {
  this._compressionPurpose = purpose;
}
```

### 1.3 serialize 方法核心逻辑 (第 121-181 行)
```typescript
async serialize(options: { omitSnapshot?: boolean, omitBlobs?: boolean } = {}) {
  const response: string[] = [];

  // 第 1 部分：构建命令结果
  if (this._result.length) {
    response.push('### Result');
    response.push(this._result.join('\n'));
    response.push('');
  }

  // 第 2 部分：添加执行的代码
  if (this._code.length) {
    response.push(`### Ran Playwright code
\`\`\`js
${this._code.join('\n')}
\`\`\``);
    response.push('');
  }

  // 第 3 部分：列出浏览器标签
  if (this._includeSnapshot !== 'none' || this._includeTabs)
    response.push(...renderTabsMarkdown(this._context.tabs(), this._includeTabs));

  // 第 4 部分：添加页面快照
  if (this._tabSnapshot?.modalStates.length) {
    response.push(...renderModalStates(this._context, this._tabSnapshot.modalStates));
    response.push('');
  } else if (this._tabSnapshot) {
    const includeSnapshot = options.omitSnapshot ? 'none' : this._includeSnapshot;
    response.push(renderTabSnapshot(this._tabSnapshot, includeSnapshot));
    response.push('');
  }

  // 合并为单一文本内容
  let textContent = response.join('\n');

  // ***** 这是压缩发生的地方 *****
  // 第 156-166 行：压缩逻辑
  if (this._compressionPurpose && !options.omitSnapshot) {
    try {
      textContent = await compress({
        purpose: this._compressionPurpose,
        content: textContent,
      });
    } catch (error: any) {
      requestDebug('Compression failed, using original content:', error?.message || String(error));
    }
  }

  // 构建最终响应
  const content: (TextContent | ImageContent)[] = [
    { type: 'text', text: textContent },
  ];

  // 添加图像附件
  if (this._context.config.imageResponses !== 'omit') {
    for (const image of this._images)
      content.push({ type: 'image', data: options.omitBlobs ? '<blob>' : image.data.toString('base64'), mimeType: image.contentType });
  }

  this._redactSecrets(content);
  return { content, isError: this._isError };
}
```

### 1.4 logEnd 方法 (第 110-119 行) - 为什么日志不被压缩
```typescript
logEnd() {
  if (requestDebug.enabled)
    // 注意：这里传递了 omitSnapshot: true，所以日志不会被压缩
    this.serialize({ omitSnapshot: true, omitBlobs: true }).then(result => {
      requestDebug(result);
    }).catch(() => {
      // Ignore errors in logging
    });
}
```

**解释**: 由于 `omitSnapshot: true`，serialize 中的条件 `!options.omitSnapshot` 会为 false，压缩被跳过。

---

## 2. 工具中的压缩参数处理

### 文件路径
- 导航: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/navigate.ts`
- 快照: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/snapshot.ts`
- 标签: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/tabs.ts`

### 2.1 browser_navigate (第 20-44 行)
```typescript
const navigate = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_navigate',
    title: 'Navigate to a URL',
    description: 'Navigate to a URL',
    inputSchema: z.object({
      url: z.string().describe('The URL to navigate to'),
      // compress_with_purpose 参数定义
      compress_with_purpose: z.string().optional().describe(
        'Optional purpose for visiting this page. If provided, the response will be compressed...'
      ),
    }),
    type: 'action',
  },

  // 处理程序
  handle: async (context, params, response) => {
    const tab = await context.ensureTab();
    await tab.navigate(params.url);

    response.setIncludeSnapshot();  // 必要：启用快照捕获
    response.addCode(`await page.goto('${params.url}');`);

    // 如果提供了压缩目的，则设置它
    if (params.compress_with_purpose)
      response.setCompressionPurpose(params.compress_with_purpose);
  },
});
```

### 2.2 browser_snapshot (第 21-40 行)
```typescript
const snapshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_snapshot',
    title: 'Page snapshot',
    description: 'Capture accessibility snapshot of the current page',
    inputSchema: z.object({
      compress_with_purpose: z.string().optional().describe(
        'Optional purpose for capturing this snapshot...'
      ),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    await context.ensureTab();
    response.setIncludeSnapshot('full');  // 必要：全快照

    if (params.compress_with_purpose)
      response.setCompressionPurpose(params.compress_with_purpose);
  },
});
```

### 2.3 browser_tabs - close 和 select 操作 (第 35-64 行)
```typescript
const browserTabs = defineTool({
  schema: {
    inputSchema: z.object({
      action: z.enum(['list', 'new', 'close', 'select']),
      index: z.number().optional(),
      compress_with_purpose: z.string().optional(),
    }),
  },

  handle: async (context, params, response) => {
    switch (params.action) {
      case 'list': {
        await context.ensureTab();
        response.setIncludeTabs();
        return;
      }
      case 'new': {
        await context.newTab();
        response.setIncludeTabs();
        return;
      }
      case 'close': {
        await context.closeTab(params.index);
        response.setIncludeSnapshot('full');
        // 只有 close 操作支持压缩
        if (params.compress_with_purpose)
          response.setCompressionPurpose(params.compress_with_purpose);
        return;
      }
      case 'select': {
        if (params.index === undefined)
          throw new Error('Tab index is required');
        await context.selectTab(params.index);
        response.setIncludeSnapshot('full');
        // 只有 select 操作支持压缩
        if (params.compress_with_purpose)
          response.setCompressionPurpose(params.compress_with_purpose);
        return;
      }
    }
  },
});
```

**关键点**：只有 `close` 和 `select` 操作调用了 `setIncludeSnapshot('full')`，所以只有这两个操作支持压缩。

---

## 3. 压缩主模块详解

### 文件路径
`/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/compression.ts`

### 3.1 Token 估算函数 (第 23-27 行)
```typescript
// Rough estimation: 1 token ≈ 4 characters for English text
// For mixed content (code, Chinese, etc.), this is a conservative estimate
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// 示例：
// "Hello World" (11 字符) = 3 tokens
// "你好世界" (8 字节) = 2 tokens
// 大型页面快照 (50KB) = 12,500 tokens
```

### 3.2 环境变量加载 (第 29-53 行)
```typescript
function loadDotEnv() {
  // Try to find .env in current directory or parent directories
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  // 逐级向上搜索 .env 文件
  while (currentDir !== root) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      compressionDebug('Loading .env from:', envPath);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const parsed = dotenv.parse(envContent);
      // Only set if not already set (不覆盖已有的变量)
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key])
          process.env[key] = value;
      }
      return;  // 找到就停止搜索
    }
    currentDir = path.dirname(currentDir);
  }
}

// Load .env on module initialization
loadDotEnv();
```

**工作流程**：
1. 从当前工作目录开始
2. 向上查找 .env 文件
3. 首次找到即加载
4. 只设置未存在的环境变量

### 3.3 压缩提示词 (第 55-120 行)
```typescript
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
```

### 3.4 OAuth 压缩函数 (第 132-182 行)
```typescript
/**
 * Compress browser output using Claude Agent SDK (OAuth)
 */
export async function compressWithOAuth(options: CompressionOptions): Promise<string> {
  const { purpose, content } = options;

  try {
    // 第 1 步：检查 OAuth token
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!oauthToken) {
      compressionDebug('CLAUDE_CODE_OAUTH_TOKEN not found in environment, skipping compression');
      return content;  // 无 token，返回原内容
    }

    compressionDebug('OAuth token found, length:', oauthToken.length);

    // 第 2 步：动态导入 Claude Agent SDK
    const { Messages } = await import('@anthropic-ai/claude-agent-sdk');

    // 第 3 步：构建用户消息
    const userMessage = purpose
      ? `Purpose: ${purpose}\n\nContent to compress:\n\n${content}`
      : `Content to compress:\n\n${content}`;

    compressionDebug('Compressing content with Claude Agent SDK (OAuth), purpose:', purpose || 'none');

    // 第 4 步：调用 Claude API
    const response = await Messages.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: COMPRESSION_PROMPT },
            { type: 'text', text: userMessage },
          ],
        },
      ],
      max_tokens: 10000,  // 压缩输出最多 10K tokens
      model: 'claude-haiku-4-5-20251001',  // 使用 Haiku 4.5
    });

    // 第 5 步：提取结果
    if (response.content?.[0]?.type === 'text') {
      const compressed = response.content[0].text || '';
      compressionDebug('Compression complete. Original length:', content.length, 'Compressed length:', compressed.length);
      return compressed;
    }

    compressionDebug('No valid response from Claude Agent SDK, returning original content');
    return content;
  } catch (error: any) {
    compressionDebug('OAuth compression failed:', error?.message || String(error));
    // 异常时返回原内容
    return content;
  }
}
```

### 3.5 Bedrock 压缩函数 (第 187-241 行)
```typescript
/**
 * Compress browser output using AWS Bedrock Haiku 4.5
 */
export async function compressWithBedrock(options: CompressionOptions): Promise<string> {
  const { purpose, content, modelId = 'global.anthropic.claude-haiku-4-5-20251001-v1:0', region = 'us-east-1' } = options;

  try {
    // 第 1 步：检查 Bearer token
    const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    if (!bearerToken) {
      compressionDebug('AWS_BEARER_TOKEN_BEDROCK not found in environment, skipping compression');
      return content;
    }

    compressionDebug('Bearer token found, length:', bearerToken.length);

    // 第 2 步：动态导入 AWS SDK
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

    // 第 3 步：创建客户端
    const client = new BedrockRuntimeClient({ region });

    // 第 4 步：构建用户消息
    const userMessage = purpose
      ? `Purpose: ${purpose}\n\nContent to compress:\n\n${content}`
      : `Content to compress:\n\n${content}`;

    // 第 5 步：创建命令
    const command = new ConverseCommand({
      modelId,  // 默认：global.anthropic.claude-haiku-4-5-20251001-v1:0
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
    
    // 第 6 步：发送请求
    const response = await client.send(command);

    // 第 7 步：提取结果
    if (response.output?.message?.content?.[0]) {
      const compressed = (response.output.message.content[0] as any).text || '';
      compressionDebug('Compression complete. Original length:', content.length, 'Compressed length:', compressed.length);
      return compressed;
    }

    compressionDebug('No valid response from Bedrock, returning original content');
    return content;
  } catch (error: any) {
    compressionDebug('Compression failed:', error?.message || String(error));
    return content;
  }
}
```

### 3.6 主压缩函数 (第 250-282 行) - 核心降级策略
```typescript
/**
 * Compress browser output with fallback strategy:
 * 1. Check if content is less than 4k tokens - if so, skip compression
 * 2. Try OAuth (Claude Agent SDK) first
 * 3. Fall back to Bedrock if OAuth fails
 * 4. Return original content if both fail
 */
export async function compress(options: CompressionOptions): Promise<string> {
  const { content } = options;

  // 第 1 步：内容大小检查
  const estimatedTokens = estimateTokenCount(content);
  if (estimatedTokens < 4000) {
    compressionDebug(`Content is small (${estimatedTokens} tokens < 4000), skipping compression`);
    return content;  // 小内容直接返回，不压缩
  }

  compressionDebug(`Content size: ${estimatedTokens} tokens, proceeding with compression`);

  // 第 2 步：尝试 OAuth（推荐方案）
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    compressionDebug('Using OAuth compression provider');
    const result = await compressWithOAuth(options);
    // 如果压缩成功（内容改变），返回结果
    if (result !== content) {
      return result;
    }
  }

  // 第 3 步：降级到 Bedrock
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    compressionDebug('Falling back to Bedrock compression provider');
    const result = await compressWithBedrock(options);
    return result;
  }

  // 第 4 步：两者都不可用
  compressionDebug('No compression provider available, returning original content');
  return content;
}
```

**降级策略**：
1. OAuth 成功 → 返回压缩结果
2. OAuth 失败 & Bedrock 可用 → 尝试 Bedrock
3. OAuth 和 Bedrock 都失败 → 返回原内容

### 3.7 检查压缩可用性 (第 287-309 行)
```typescript
/**
 * Check if compression is available (OAuth or AWS SDK installed and credentials configured)
 */
export async function isCompressionAvailable(): Promise<boolean> {
  // 检查 OAuth token
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    try {
      await import('@anthropic-ai/claude-agent-sdk');
      return true;  // OAuth 可用
    } catch {
      // 继续检查 Bedrock
    }
  }

  // 检查 Bedrock token
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    try {
      await import('@aws-sdk/client-bedrock-runtime');
      return true;  // Bedrock 可用
    } catch {
      return false;  // Bedrock SDK 未安装
    }
  }

  return false;  // 两者都不可用
}
```

---

## 4. 后端执行链接

### 文件路径
`/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/browserServerBackend.ts`

### 执行流程 (第 57-77 行)
```typescript
async callTool(name: string, rawArguments: mcpServer.CallToolRequest['params']['arguments']) {
  // 第 1 步：找到工具定义
  const tool = this._tools.find(tool => tool.schema.name === name)!;
  if (!tool)
    throw new Error(`Tool "${name}" not found`);
  
  // 第 2 步：解析参数（包括 compress_with_purpose）
  const parsedArguments = tool.schema.inputSchema.parse(rawArguments || {});
  const context = this._context!;
  
  // 第 3 步：创建响应对象
  const response = new Response(context, name, parsedArguments);
  response.logBegin();
  context.setRunningTool(name);
  
  try {
    // 第 4 步：执行工具处理程序
    // 这里会调用 response.setCompressionPurpose(params.compress_with_purpose)
    await tool.handle(context, parsedArguments, response);
    
    // 第 5 步：完成响应（捕获快照）
    await response.finish();
    this._sessionLog?.logResponse(response);
  } catch (error: any) {
    response.addError(String(error));
  } finally {
    context.setRunningTool(undefined);
  }
  
  response.logEnd();
  
  // 第 6 步：序列化响应并应用压缩
  // 这里会检查 this._compressionPurpose 并调用 compress()
  return await response.serialize();
}
```

---

## 5. 完整的调用示例

### 示例：带压缩的导航请求

```typescript
// 用户调用 (伪代码)
{
  tool: "browser_navigate",
  arguments: {
    url: "https://example.com/products",
    compress_with_purpose: "保留网站全部主体内容"
  }
}

// 内部执行：

// 1. parseArguments
// {
//   url: "https://example.com/products",
//   compress_with_purpose: "保留网站全部主体内容"
// }

// 2. 创建 Response 对象
const response = new Response(context, 'browser_navigate', parsedArguments);

// 3. 执行 navigate.handle()
await tab.navigate("https://example.com/products");
response.setIncludeSnapshot();  // 启用快照捕获
response.addCode(`await page.goto('https://example.com/products');`);
response.setCompressionPurpose("保留网站全部主体内容");  // 启用压缩

// 4. response.finish()
// 捕获页面快照并存储在 _tabSnapshot

// 5. response.serialize()
// 构建文本内容：
// ### Result
// [结果]
//
// ### Ran Playwright code
// ```js
// await page.goto('https://example.com/products');
// ```
//
// ### Open tabs
// - 0: (current) [Example Products] (https://example.com/products)
//
// ### Page state
// - Page URL: https://example.com/products
// - Page Title: Example Products
// - Page Snapshot:
// ```yaml
// [ARIA 快照...]
// ```

// 6. 压缩逻辑执行
// if (this._compressionPurpose && !options.omitSnapshot)  // 两个条件都为 true
//   textContent = await compress({
//     purpose: "保留网站全部主体内容",
//     content: "[上面构建的完整文本]"
//   });

// 在 compress() 函数中：
// - 估算 tokens: textContent.length / 4
// - 如果 < 4000: 返回原内容
// - 尝试 OAuth: 
//   - 调用 Claude Haiku 4.5
//   - 返回压缩结果或原内容
// - 降级 Bedrock:
//   - 调用 AWS Bedrock Claude Haiku 4.5
//   - 返回压缩结果或原内容

// 7. 返回最终响应
{
  content: [
    {
      type: 'text',
      text: "[压缩后的文本，通常是原文本的 40-70%]"
    }
  ]
}
```

---

## 总结

### 压缩启用的必要条件
1. 工具调用提供 `compress_with_purpose` 参数
2. 工具 handle() 调用 `response.setIncludeSnapshot()`
3. 工具 handle() 调用 `response.setCompressionPurpose(params.compress_with_purpose)`
4. 快照内容 >= 4000 tokens (16KB 字符)
5. 至少配置了 OAuth 或 Bedrock 凭证
6. 相应的 SDK 已安装

### 压缩跳过的场景
1. 没有传递 `compress_with_purpose`
2. `serialize()` 调用时 `omitSnapshot: true` (仅日志)
3. 快照内容 < 4000 tokens
4. 两个凭证都未配置
5. 工具没有调用 `setIncludeSnapshot()`
6. API 请求失败（会降级或返回原内容）

### 压缩的可靠性
- 所有异常都被捕获并返回原内容
- 没有压缩时客户端无差异（内容相同，只是更长）
- 压缩失败是优雅的降级
