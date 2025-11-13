================================================================================
                   Playwright MCP 压缩功能分析报告
================================================================================

项目: Playwright MCP Browser Tools
分析时间: 2025-11-13
分支: main

================================================================================
分析内容总结
================================================================================

本分析包含对 Playwright MCP 中 compress_with_purpose 参数的全面研究，涵盖:

1. 核心实现文件位置
2. 压缩流程的完整逻辑链
3. 压缩失效的 8 个主要原因
4. 详细的代码片段和调试指南
5. 快速参考和验证清单

================================================================================
关键发现
================================================================================

【压缩功能概述】
- 参数名: compress_with_purpose (可选)
- 支持工具: browser_navigate, browser_snapshot, browser_tabs
- 压缩引擎: Claude Haiku 4.5
- 压缩方式: OAuth (推荐) 或 AWS Bedrock (备选)
- 压缩效果: 40-70% 大小缩减

【主要文件】
1. 压缩实现 (310 行)
   /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/compression.ts

2. 响应处理 (313 行)
   /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/response.ts
   - 关键: 第 156-166 行的压缩触发

3. 工具集成 (各工具)
   - navigate.ts: 第 42 行
   - snapshot.ts: 第 38 行
   - tabs.ts: 第 50-51, 59-60 行

4. 后端执行
   /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/browserServerBackend.ts
   - 第 76 行调用 serialize()

【执行流程】
工具调用 → 设置 compressionPurpose → 捕获快照 → serialize() → 检查条件 → compress() → 返回结果

【压缩失效的 8 个原因】
1. 参数未传递 (compress_with_purpose 为 undefined)
2. 快照被省略 (omitSnapshot: true 在日志调用中)
3. 内容过小 (< 4000 tokens = ~16KB)
4. 环境变量未配置 (两个 token 都缺失)
5. 依赖库未安装 (SDK 导入失败)
6. API 请求失败 (网络或凭证问题)
7. 工具未启用快照 (没有调用 setIncludeSnapshot())
8. 工具在日志阶段 (可控的、正常的行为)

【必要条件】
- 至少配置一个: CLAUDE_CODE_OAUTH_TOKEN 或 AWS_BEARER_TOKEN_BEDROCK
- 快照内容 >= 4000 tokens (约 16KB)
- 工具调用包含 compress_with_purpose 参数
- 工具 handle() 调用了 setIncludeSnapshot()
- 相应 SDK 已安装并可导入

【可靠性特点】
- 异常处理: 所有异常都被捕获，返回原内容
- 降级策略: OAuth 失败会自动尝试 Bedrock
- 优雅降级: 无压缩时返回原内容，功能无差异
- 日志不压缩: logEnd() 时使用 omitSnapshot: true (意图设计)

================================================================================
三份文档说明
================================================================================

1. COMPRESSION_ANALYSIS.md (13KB)
   - 全面分析文档
   - 8 个小节，涵盖所有细节
   - 包含完整流程图和时序图
   - 目标: 深入理解压缩功能

2. KEY_CODE_SNIPPETS.md (22KB)
   - 代码参考手册
   - 5 个小节，包含完整代码示例
   - 每个重要函数都有详细注释
   - 目标: 代码级深度学习

3. COMPRESSION_QUICK_REFERENCE.md (8.8KB)
   - 快速参考指南
   - 关键概念、文件位置、调试方法
   - 常见问题和效果示例
   - 目标: 快速查阅和问题排查

================================================================================
快速诊断清单
================================================================================

压缩未生效时，按以下步骤诊断:

1. 检查环境变量
   [ ] echo $CLAUDE_CODE_OAUTH_TOKEN
   [ ] echo $AWS_BEARER_TOKEN_BEDROCK
   至少一个不为空

2. 检查 SDK 安装
   [ ] npm ls @anthropic-ai/claude-agent-sdk
   [ ] npm ls @aws-sdk/client-bedrock-runtime
   对应的 SDK 应该已安装

3. 检查参数传递
   [ ] 工具调用包含 compress_with_purpose 参数
   [ ] 参数值不为空字符串

4. 检查快照大小
   [ ] 启用调试日志: DEBUG=pw:mcp:compression npm test
   [ ] 查找 "Content is small" 消息
   [ ] 快照应该 > 4000 tokens

5. 检查工具实现
   [ ] 工具 handle() 调用了 response.setIncludeSnapshot()
   [ ] 工具 handle() 调用了 response.setCompressionPurpose()

6. 检查网络连接
   [ ] 测试 API 端点连接
   [ ] 检查防火墙/代理设置

================================================================================
文件位置速查
================================================================================

核心实现:
  /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/compression.ts

响应处理:
  /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/response.ts

工具集成:
  /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/navigate.ts
  /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/tools/snapshot.ts
  /home/weidwonder/projects/playwright/src/mcp/browser/tools/tabs.ts

后端:
  /home/weidwonder/projects/playwright/packages/playwright/src/mcp/browser/browserServerBackend.ts

================================================================================
关键代码位置 (行号)
================================================================================

压缩参数定义:
  - navigate.ts 第 29 行: compress_with_purpose 参数定义
  - snapshot.ts 第 28 行: compress_with_purpose 参数定义
  - tabs.ts 第 30 行: compress_with_purpose 参数定义

压缩激活:
  - navigate.ts 第 42 行: response.setCompressionPurpose()
  - snapshot.ts 第 38 行: response.setCompressionPurpose()
  - tabs.ts 第 50-51, 59-60 行: response.setCompressionPurpose()

响应处理:
  - response.ts 第 88-90 行: setCompressionPurpose() 方法
  - response.ts 第 156-166 行: 压缩触发逻辑

压缩实现:
  - compression.ts 第 25-27 行: Token 估算
  - compression.ts 第 55-120 行: 压缩提示词
  - compression.ts 第 132-182 行: OAuth 压缩
  - compression.ts 第 187-241 行: Bedrock 压缩
  - compression.ts 第 250-282 行: 主压缩函数 (含降级策略)
  - compression.ts 第 287-309 行: 可用性检查

后端链接:
  - browserServerBackend.ts 第 57-77 行: callTool() 执行流程
  - browserServerBackend.ts 第 76 行: response.serialize() 调用

================================================================================
推荐阅读顺序
================================================================================

初学者路线:
  1. COMPRESSION_QUICK_REFERENCE.md (全部)
  2. COMPRESSION_ANALYSIS.md 第 1-3 节
  3. KEY_CODE_SNIPPETS.md 第 1 节

深度学习路线:
  1. COMPRESSION_ANALYSIS.md (全部 8 节)
  2. KEY_CODE_SNIPPETS.md (全部 5 节)
  3. 查看源代码对应行

问题排查路线:
  1. COMPRESSION_QUICK_REFERENCE.md 的 "调试快速指南"
  2. COMPRESSION_ANALYSIS.md 第 4 和 7 节
  3. KEY_CODE_SNIPPETS.md 的 "错误场景"

================================================================================
技术栈信息
================================================================================

LLM:
  - Claude Haiku 4.5 (claude-haiku-4-5-20251001)
  - 成本: 每 1M tokens 约 $0.80 (比较便宜)
  - 速度: 通常 500ms-2s (取决于网络)

身份验证:
  - OAuth: @anthropic-ai/claude-agent-sdk (推荐)
  - AWS Bedrock: @aws-sdk/client-bedrock-runtime (备选)

调试:
  - Debug namespace: pw:mcp:compression
  - 使用: DEBUG=pw:mcp:compression node script.js

配置:
  - 环境变量: CLAUDE_CODE_OAUTH_TOKEN, AWS_BEARER_TOKEN_BEDROCK
  - .env 文件: 自动从当前目录向上搜索加载

================================================================================
常见问题速答
================================================================================

Q: 为什么我的压缩没有生效?
A: 检查 compress_with_purpose 参数是否已传递，环境变量是否已设置，
   快照内容是否足够大 (> 4000 tokens)。见诊断清单。

Q: 压缩会改变元素的 ref 号吗?
A: 不会。ref 号 [N] 被保留，这对 Playwright 定位元素至关重要。

Q: 压缩失败时会怎样?
A: 返回原内容，功能不受影响。用户看不出差异，只是响应更长。

Q: 可以自定义压缩提示词吗?
A: 目前不行。提示词硬编码优化用于 Playwright 快照。

Q: OAuth 还是 Bedrock，哪个更好?
A: OAuth 推荐 - 更快、更可靠。Bedrock 作为备选。

================================================================================
文件清单
================================================================================

分析文档 (已保存到项目根目录):
  [×] COMPRESSION_ANALYSIS.md - 全面分析 (13KB)
  [×] KEY_CODE_SNIPPETS.md - 代码参考 (22KB)
  [×] COMPRESSION_QUICK_REFERENCE.md - 快速参考 (8.8KB)

源代码文件 (相对路径):
  packages/playwright/src/mcp/browser/compression.ts
  packages/playwright/src/mcp/browser/response.ts
  packages/playwright/src/mcp/browser/tools/navigate.ts
  packages/playwright/src/mcp/browser/tools/snapshot.ts
  packages/playwright/src/mcp/browser/tools/tabs.ts
  packages/playwright/src/mcp/browser/browserServerBackend.ts

================================================================================
更新日期和版本信息
================================================================================

分析完成: 2025-11-13 15:02:35 UTC+8
代码版本: 基于 main 分支最新代码
压缩模块大小: 310 行 (compression.ts)
响应模块大小: 313 行 (response.ts)
工具数量: 3 个支持压缩 (navigate, snapshot, tabs)
支持的身份验证方式: 2 个 (OAuth, Bedrock)

================================================================================
联系和反馈
================================================================================

如发现分析有误或需要补充内容，请:
1. 检查源代码是否已更新
2. 参考 KEY_CODE_SNIPPETS.md 中的行号
3. 查看相应的源文件验证

================================================================================
