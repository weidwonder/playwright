# 🔴 Playwright MCP 压缩功能失效诊断报告

## 问题概述

压缩功能**完全无法工作**，虽然你已配置了 OAuth token，但在实际执行时压缩被静默跳过。

---

## 根本原因（已确认）

### 1. **致命问题：SDK 导入错误** ❌

**文件**: `packages/playwright/src/mcp/browser/compression.ts:146`

```typescript
const { Messages } = await import('@anthropic-ai/claude-agent-sdk');
```

**问题**:
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) **不导出** `Messages` API
- 导入失败，导致异常被捕获并返回原始内容
- 用户看不到任何错误提示

**实际 SDK 导出**:
```
✅ 导出: query, tool, createSdkMcpServer, ...
❌ 不导出: Messages
```

### 2. **缺失的依赖**

**检查结果**:
```bash
npm list @anthropic-ai/sdk
# → (empty) ❌ 未安装
```

**需要的正确 SDK**:
- `@anthropic-ai/sdk` - 官方 Anthropic SDK，提供 `Messages` API
- 目前只有 `@anthropic-ai/claude-agent-sdk` 被安装，这是 Claude Code SDK，不是 API SDK

---

## 执行流程中的故障点

```
1. browser_navigate({ compress_with_purpose: "..." })
   ✅ 参数被正确接收和传递

2. response.setCompressionPurpose(params.compress_with_purpose)
   ✅ 目的被存储到 _compressionPurpose

3. response.serialize()
   ✅ 调用了 compress({ purpose, content })

4. compress() → compressWithOAuth()
   ✅ 检查了 OAuth token（存在）
   ✅ 尝试导入 '@anthropic-ai/claude-agent-sdk'

5. const { Messages } = await import('@anthropic-ai/claude-agent-sdk')
   ❌ Messages 是 undefined！
   ✅ 异常被捕获，返回原始内容

6. 返回原始 31,000+ token 内容
   😞 无任何压缩，用户看不到错误
```

---

## 诊断测试证据

运行 `test-compression.js` 的输出：

```
❌ OAuth 压缩测试失败：
错误信息: Cannot read properties of undefined (reading 'create')
错误类型: TypeError
```

这证实了 `Messages` 不存在。

---

## 解决方案

### 选项 1：安装正确的 SDK（推荐）

```bash
npm install @anthropic-ai/sdk
```

然后修改 `compression.ts:146`:

```typescript
// 错误❌
const { Messages } = await import('@anthropic-ai/claude-agent-sdk');

// 正确✅
const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);
const messages = new Anthropic.Messages();  // 或直接使用 Anthropic client
```

### 选项 2：使用 Anthropic client 方式

```typescript
const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);
const client = new Anthropic({
  apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN,
});

const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 10000,
  messages: [...]
});
```

---

## 关键代码位置

| 文件 | 行号 | 问题 |
|------|------|------|
| `compression.ts` | 146 | 错误的 SDK 导入 |
| `compression.ts` | 155 | 调用不存在的 API |
| `compression.ts` | 177-180 | 宽泛的异常处理，隐藏了真实错误 |

---

## 临时调试方法

启用详细错误日志：

编辑 `compression.ts:177-180`:

```typescript
catch (error: any) {
  // 修改前❌
  compressionDebug('OAuth compression failed:', error?.message || String(error));
  return content;

  // 修改后✅ (仅用于调试)
  console.error('COMPRESSION ERROR:', error);
  compressionDebug('OAuth compression failed:', error?.message || String(error));
  return content;
}
```

然后运行：
```bash
DEBUG=pw:mcp:compression node your-script.js 2>&1
```

---

## 为什么环境变量配置后仍然失效

1. ✅ `.env` 文件被正确加载
2. ✅ `CLAUDE_CODE_OAUTH_TOKEN` 被设置
3. ✅ `compress()` 函数被调用
4. ❌ `Messages` 导入失败（TypeError）
5. ❌ 异常被捕获，返回原始内容

**用户看到的现象**：
- 仍然返回 31,000+ tokens
- 没有压缩发生
- 没有错误消息
- 完全无法发现问题原因

---

## 建议的修复步骤

1. **安装依赖**:
   ```bash
   npm install @anthropic-ai/sdk
   ```

2. **修复 `compression.ts`** (所有 OAuth 和 Bedrock 函数):
   - 导入正确的 SDK
   - 使用正确的 API 调用方式
   - 保持现有的错误处理逻辑

3. **改进错误处理** (可选但推荐):
   - 不要吞掉导入错误
   - 在初始化时检查 SDK 可用性
   - 提供更清晰的诊断消息

4. **测试压缩**:
   ```bash
   npm run test-compression
   ```

---

## 总结

**压缩功能之所以失效，是因为使用了错误的 SDK**。

即使你已正确配置了 OAuth token，由于代码试图从 Claude Agent SDK（错误的库）导入 `Messages` API，所有压缩请求都会静默失败。

需要的修复很简单：
- 安装 `@anthropic-ai/sdk`
- 修改导入语句
- 完成！
