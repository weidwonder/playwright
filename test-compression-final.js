#!/usr/bin/env node

/**
 * 测试修复后的压缩功能 - 使用 Claude Agent SDK
 */

const fs = require('fs');
const path = require('path');

// 加载环境变量
function loadDotEnv() {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      console.log('[INFO] Loading .env from:', envPath);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
      return;
    }
    currentDir = path.dirname(currentDir);
  }
}

loadDotEnv();

// 检查凭证
console.log('\n=== 环境变量检查 ===');
console.log('CLAUDE_CODE_OAUTH_TOKEN:', process.env.CLAUDE_CODE_OAUTH_TOKEN ? `✅ (${process.env.CLAUDE_CODE_OAUTH_TOKEN.substring(0, 20)}...)` : '❌ 未设置');
console.log('AWS_BEARER_TOKEN_BEDROCK:', process.env.AWS_BEARER_TOKEN_BEDROCK ? '✅ (已设置)' : '❌ 未设置');

// 测试修复后的 OAuth 压缩
async function testCompressionWithSDK() {
  console.log('\n=== 测试修复后的 OAuth 压缩 (使用 Claude Agent SDK) ===');

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.log('❌ OAuth token 未设置，跳过测试');
    return;
  }

  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    console.log('✅ Claude Agent SDK 导入成功');
    console.log('✅ query 函数可用:', typeof sdk.query === 'function');

    const testContent = '# 测试内容\n\n这是一个测试的压缩请求。' + '\n这是额外的内容来达到足够的大小。'.repeat(100);
    const prompt = `请压缩以下内容，保留关键信息：\n\n${testContent}`;

    console.log(`📝 测试 prompt 大小: ${prompt.length} 字符`);
    console.log('⏳ 通过 Claude Agent SDK 发送请求...');

    const response = sdk.query({
      prompt: prompt,
    });

    let assistantMessage = '';
    console.log('📨 接收流式响应...');

    for await (const message of response) {
      if (message.type === 'assistant') {
        console.log(`  - 接收到 assistant 消息，内容类型: ${message.message.content?.[0]?.type}`);
        if (message.message.content?.[0]?.type === 'text') {
          assistantMessage = message.message.content[0].text || '';
          console.log(`  - 消息长度: ${assistantMessage.length} 字符`);
          break; // 获取第一个响应后停止
        }
      } else if (message.type === 'result') {
        console.log(`  - 接收到 result 消息`);
      }
    }

    if (assistantMessage) {
      const ratio = ((1 - assistantMessage.length / testContent.length) * 100).toFixed(1);
      console.log(`\n✅ 压缩成功！`);
      console.log(`📊 原始大小: ${testContent.length} 字符`);
      console.log(`📊 压缩后: ${assistantMessage.length} 字符`);
      console.log(`📊 压缩率: ${ratio}%`);
      console.log(`📝 样本:\n${assistantMessage.substring(0, 200)}...`);
    } else {
      console.log('⚠️ 未收到有效的响应');
    }
  } catch (error) {
    console.log('❌ SDK 压缩测试失败：');
    console.log('错误信息:', error.message);
    console.log('错误类型:', error.constructor.name);
    console.log('错误堆栈:');
    console.error(error);
  }
}

// 测试 SDK 导入
async function testSDKImport() {
  console.log('\n=== 测试 Claude Agent SDK 导入 ===');
  try {
    const module = await import('@anthropic-ai/claude-agent-sdk');
    console.log('✅ @anthropic-ai/claude-agent-sdk 导入成功');
    console.log('📦 导出的成员:', Object.keys(module).join(', '));
    console.log('✅ query 函数:', typeof module.query);
  } catch (error) {
    console.log('❌ SDK 导入失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('🚀 Playwright MCP 压缩功能 - 修复版本测试\n');

  await testSDKImport();
  await testCompressionWithSDK();

  console.log('\n=== 诊断完成 ===\n');
}

main().catch(console.error);
