# Playwright MCP 压缩功能详细分析

## 1. 核心文件地址

### 主要实现文件：
- **压缩主模块**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/compression.ts`
- **压缩示例**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/compression.example.ts`
- **响应处理**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/response.ts`
- **导航工具**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/navigate.ts`
- **快照工具**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/snapshot.ts`
- **标签工具**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/tabs.ts`
- **后端服务**: `/home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/browserServerBackend.ts`

## 2. 压缩功能的处理流程

### 2.1 参数接收层（Tools）

#### browser_navigate 中的处理
```typescript
// 文件: navigate.ts, 第 20-44 行
const navigate = defineTool({
  schema: {
    inputSchema: z.object({
      url: z.string(),
      compress_with_purpose: z.string().optional().describe('Optional purpose...')
    })
  },
  handle: async (context, params, response) => {
    await tab.navigate(params.url);
    response.setIncludeSnapshot();
    if (params.compress_with_purpose)
      response.setCompressionPurpose(params.compress_with_purpose);  // 第 42 行
  }
});
```

#### browser_snapshot 中的处理
```typescript
// 文件: snapshot.ts, 第 21-40 行
const snapshot = defineTool({
  schema: {
    inputSchema: z.object({
      compress_with_purpose: z.string().optional()
    })
  },
  handle: async (context, params, response) => {
    response.setIncludeSnapshot('full');
    if (params.compress_with_purpose)
      response.setCompressionPurpose(params.compress_with_purpose);  // 第 38 行
  }
});
```

#### browser_tabs 中的处理
```typescript
// 文件: tabs.ts, 第 20-65 行
// 在 'close' 和 'select' 操作中：
if (params.compress_with_purpose)
  response.setCompressionPurpose(params.compress_with_purpose);  // 第 50-51, 59-60 行
```

### 2.2 响应类处理层（Response）

#### 设置压缩目的
```typescript
// 文件: response.ts, 第 88-90 行
setCompressionPurpose(purpose: string) {
  this._compressionPurpose = purpose;
}
```

#### 序列化和压缩执行
```typescript
// 文件: response.ts, 第 121-181 行
async serialize(options: { omitSnapshot?: boolean, omitBlobs?: boolean } = {}) {
  // ... 构建响应内容 ...
  
  // 关键压缩逻辑 (第 156-166 行)
  if (this._compressionPurpose && !options.omitSnapshot) {
    try {
      textContent = await compress({
        purpose: this._compressionPurpose,
        content: textContent,
      });
    } catch (error: any) {
      requestDebug('Compression failed, using original content:', error?.message);
    }
  }
  
  return { content, isError: this._isError };
}
```

### 2.3 执行流程链

```
工具处理 (navigate/snapshot/tabs)
    ↓
设置 response.setCompressionPurpose(params.compress_with_purpose)
    ↓
response.finish() - 捕获快照
    ↓
BrowserServerBackend.callTool() - 第 76 行调用 response.serialize()
    ↓
Response.serialize()
    ↓
检查 this._compressionPurpose && !options.omitSnapshot
    ↓
调用 compress({ purpose, content })
    ↓
返回压缩后的内容
```

## 3. 压缩实现详解（compression.ts）

### 3.1 Token 估算
```typescript
// 第 25-27 行
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);  // 粗略估算：1 token ≈ 4 字符
}
```

### 3.2 环境变量加载
```typescript
// 第 30-53 行
function loadDotEnv() {
  // 逐级向上搜索 .env 文件
  // 优先使用现有的环境变量 (不覆盖)
}
```

### 3.3 三个压缩函数

#### 1) compressWithOAuth (OAuth 方式 - 推荐)
```typescript
// 第 132-182 行
export async function compressWithOAuth(options: CompressionOptions) {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken)
    return content;  // 跳过压缩
  
  const { Messages } = await import('@anthropic-ai/claude-agent-sdk');
  
  const response = await Messages.create({
    messages: [...],
    max_tokens: 10000,
    model: 'claude-haiku-4-5-20251001',  // 使用 Haiku 4.5
  });
  
  return response.content[0].text || content;  // 失败时返回原内容
}
```

#### 2) compressWithBedrock (AWS Bedrock 方式)
```typescript
// 第 187-241 行
export async function compressWithBedrock(options: CompressionOptions) {
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!bearerToken)
    return content;
  
  const { BedrockRuntimeClient, ConverseCommand } = 
    await import('@aws-sdk/client-bedrock-runtime');
  
  const client = new BedrockRuntimeClient({ region });
  const response = await client.send(command);
  
  return response.output?.message?.content?.[0]?.text || content;
}
```

#### 3) compress (主要压缩函数 - 带降级策略)
```typescript
// 第 250-282 行
export async function compress(options: CompressionOptions) {
  const { content } = options;
  
  // 1. 检查内容大小 - 跳过小于 4k tokens 的内容
  const estimatedTokens = estimateTokenCount(content);
  if (estimatedTokens < 4000) {
    compressionDebug(`Content is small (${estimatedTokens} tokens < 4000), skipping`);
    return content;  // 直接返回，不压缩
  }
  
  // 2. 尝试 OAuth 优先
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    const result = await compressWithOAuth(options);
    if (result !== content)  // 压缩成功则返回
      return result;
  }
  
  // 3. 降级到 Bedrock
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    return await compressWithBedrock(options);
  }
  
  // 4. 都不可用时返回原内容
  compressionDebug('No compression provider available');
  return content;
}
```

### 3.4 压缩提示词
```typescript
// 第 55-120 行
const COMPRESSION_PROMPT = `# Browser Tool Proxy Sub-Agent

Execute \`browser_navigate()\` and \`browser_snapshot()\` calls...

## 核心职责
过滤 Playwright 快照：
- **保留**: 主内容、数据元素、交互控件、ALL refs [N]、元素属性、文本内容
- **移除**: 广告、Cookie 横幅、追踪脚本、分析代码、无关导航

## 保留/移除规则
保留：产品列表、文章、搜索结果、表单、分页、登录
移除：Cookie 横幅、广告、分析脚本、社交组件、通讯订阅

目标：减少输出到原始长度的 40-70%，但不超过 10K tokens
`;
```

## 4. 压缩失效的可能原因

### 4.1 参数未传递
- **问题**: 工具调用时没有提供 `compress_with_purpose` 参数
- **结果**: `this._compressionPurpose` 为 undefined，压缩被跳过
- **检查**: Response 类第 157 行 `if (this._compressionPurpose && !options.omitSnapshot)`

### 4.2 快照被省略
- **问题**: 在 serialize() 调用时传递了 `omitSnapshot: true`
- **代码**: response.ts 第 113 行的日志调用
```typescript
this.serialize({ omitSnapshot: true, omitBlobs: true }).then(...)
```
- **结果**: 第 157 行条件 `!options.omitSnapshot` 为 false，压缩被跳过

### 4.3 内容过小
- **问题**: 快照内容小于 4000 tokens (约 16KB 字符)
- **代码**: compression.ts 第 254-257 行
```typescript
const estimatedTokens = estimateTokenCount(content);
if (estimatedTokens < 4000) {
  compressionDebug(`Content is small (${estimatedTokens} tokens < 4000), skipping`);
  return content;
}
```
- **结果**: 直接返回原内容

### 4.4 环境变量未配置
压缩需要以下条件之一：
1. **OAuth Token**: `process.env.CLAUDE_CODE_OAUTH_TOKEN`
2. **Bedrock Token**: `process.env.AWS_BEARER_TOKEN_BEDROCK`
3. **两者都缺失**: 压缩完全禁用，返回原内容

- **代码**: compression.ts 第 262-280 行
```typescript
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  // 尝试 OAuth
} else if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
  // 尝试 Bedrock
} else {
  // 两者都不可用，返回原内容
}
```

### 4.5 依赖库未安装
- **问题**: 所需的 SDK 库未安装
  - OAuth: `@anthropic-ai/claude-agent-sdk`
  - Bedrock: `@aws-sdk/client-bedrock-runtime`
- **代码**: compression.ts 第 146, 201 行使用了动态导入
```typescript
const { Messages } = await import('@anthropic-ai/claude-agent-sdk');  // 可能失败
```
- **结果**: 捕获异常，降级或返回原内容

### 4.6 API 请求失败
- **问题**: 调用 Claude API 或 Bedrock 失败
- **代码**: compression.ts 第 177-181 行
```typescript
} catch (error: any) {
  compressionDebug('OAuth compression failed:', error?.message);
  return content;  // 异常时返回原内容
}
```
- **结果**: 返回原内容

### 4.7 Tool 未调用 setIncludeSnapshot()
- **问题**: 工具处理器没有调用 `response.setIncludeSnapshot()`
- **结果**: 没有快照内容，serialize() 的 textContent 仅包含结果和代码，可能不需要压缩

### 4.8 工具在日志阶段被调用
- **问题**: 日志调用使用了 `omitSnapshot: true`
- **代码**: response.ts 第 110-119 行
```typescript
logEnd() {
  if (requestDebug.enabled)
    this.serialize({ omitSnapshot: true, omitBlobs: true }).then(...)
}
```
- **说明**: 这是正常行为，日志不需要压缩

## 5. 压缩流程时序图

```
用户调用工具 (带 compress_with_purpose 参数)
    ↓
browserServerBackend.callTool()
    ↓
工具 handle() 方法执行
    ├─ response.setIncludeSnapshot()
    └─ response.setCompressionPurpose(params.compress_with_purpose)
    ↓
response.finish() - 捕获页面快照 (_tabSnapshot)
    ↓
response.serialize() 被调用 (无 omitSnapshot)
    ↓
构建响应文本内容
    ├─ ### Result
    ├─ ### Ran Playwright code
    ├─ ### Open tabs
    └─ ### Page state (YAML 格式的 ARIA 快照)
    ↓
检查 this._compressionPurpose && !options.omitSnapshot
    ↓
调用 compress({ purpose, content })
    ├─ 估算 tokens: content.length / 4
    ├─ 检查: estimatedTokens >= 4000?
    │  ├─ YES: 继续压缩
    │  └─ NO: 返回原内容
    ├─ 尝试 OAuth
    │  ├─ CLAUDE_CODE_OAUTH_TOKEN 存在?
    │  ├─ SDK 已安装?
    │  └─ API 调用成功?
    ├─ 降级到 Bedrock
    │  ├─ AWS_BEARER_TOKEN_BEDROCK 存在?
    │  ├─ SDK 已安装?
    │  └─ API 调用成功?
    └─ 都失败: 返回原内容
    ↓
返回最终响应 { content: [{ type: 'text', text: ... }], ... }
```

## 6. 关键代码片段总结

### 6.1 启用压缩的完整调用
```typescript
// 示例：在 navigate 工具中
const response = new Response(context, 'browser_navigate', params);
await response.setIncludeSnapshot();  // 重要！
response.setCompressionPurpose('保留网站全部主体内容');  // 启用压缩

// 内部流程：
const serialized = await response.serialize();
// -> 调用 compress({ 
//      purpose: '保留网站全部主体内容', 
//      content: '### Result\n...\n### Page state\n...' 
//    })
// -> 返回压缩后的文本
```

### 6.2 压缩被跳过的场景

#### 场景 1: 没有设置 purpose
```typescript
// 压缩被跳过
response.setIncludeSnapshot();
// 没有调用 response.setCompressionPurpose()
```

#### 场景 2: omitSnapshot 为 true
```typescript
// response.ts 中的日志调用
serialize({ omitSnapshot: true, omitBlobs: true })  // 压缩被跳过
```

#### 场景 3: 内容过小
```typescript
// 自动跳过：content.length < 16000 字符
const content = "### Result\nSmall response";  // ~30 tokens
compress({ purpose: '...', content })  // 直接返回，不压缩
```

#### 场景 4: 无有效凭证
```typescript
// 都无法使用时
const CLAUDE_CODE_OAUTH_TOKEN = undefined;
const AWS_BEARER_TOKEN_BEDROCK = undefined;
// -> 返回原内容
```

## 7. 调试压缩问题

### 启用调试日志
```bash
export DEBUG=pw:mcp:compression
# 或
export DEBUG=pw:mcp:*
```

### 调试日志输出
compression.ts 中的关键调试点：
- 第 38 行: .env 文件加载
- 第 143 行: OAuth token 发现
- 第 152 行: 开始 OAuth 压缩
- 第 171 行: OAuth 压缩完成
- 第 198 行: Bedrock token 发现
- 第 225 行: 开始 Bedrock 压缩
- 第 230 行: Bedrock 压缩完成
- 第 256 行: 内容过小，跳过压缩

response.ts 中的关键调试点：
- 第 164 行: 压缩失败异常捕获

## 8. 验证清单

- [ ] 工具调用包含 `compress_with_purpose` 参数
- [ ] `compress_with_purpose` 值不为空字符串
- [ ] 工具 handle() 调用了 `response.setIncludeSnapshot()`
- [ ] 快照内容大于 4000 tokens (16KB 字符)
- [ ] 环境变量已设置：
  - [ ] `CLAUDE_CODE_OAUTH_TOKEN` 或
  - [ ] `AWS_BEARER_TOKEN_BEDROCK`
- [ ] 相应 SDK 已安装：
  - [ ] `@anthropic-ai/claude-agent-sdk` (OAuth) 或
  - [ ] `@aws-sdk/client-bedrock-runtime` (Bedrock)
- [ ] 启用调试日志检查执行流程
- [ ] API 请求有网络连接和有效凭证

