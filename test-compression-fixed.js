#!/usr/bin/env node

/**
 * 测试修复后的压缩功能
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
async function testCompressionWithOAuth() {
  console.log('\n=== 测试修复后的 OAuth 压缩 ===');

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.log('❌ OAuth token 未设置，跳过测试');
    return;
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    console.log('✅ Anthropic SDK 导入成功');

    const testContent = '# 测试内容\n\n这是一个测试的压缩请求。' + '\n这是额外的内容来达到足够的大小。'.repeat(100);

    console.log(`📝 测试内容大小: ${testContent.length} 字符`);
    console.log('⏳ 发送请求到 Claude Haiku 4.5...');

    const client = new Anthropic({
      apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    });

    const response = await client.messages.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请压缩以下内容，保留关键信息：' },
            { type: 'text', text: testContent },
          ],
        },
      ],
      max_tokens: 1000,
      model: 'claude-haiku-4-5-20251001',
    });

    if (response.content?.[0]?.type === 'text') {
      const compressed = response.content[0].text || '';
      const ratio = ((1 - compressed.length / testContent.length) * 100).toFixed(1);
      console.log(`✅ 压缩成功！`);
      console.log(`📊 原始大小: ${testContent.length} 字符`);
      console.log(`📊 压缩后: ${compressed.length} 字符`);
      console.log(`📊 压缩率: ${ratio}%`);
      console.log(`📝 样本: ${compressed.substring(0, 100)}...`);
    } else {
      console.log('❌ API 返回了无效的响应格式');
      console.log('响应:', JSON.stringify(response, null, 2));
    }
  } catch (error) {
    console.log('❌ OAuth 压缩测试失败：');
    console.log('错误信息:', error.message);
    console.log('错误类型:', error.constructor.name);
    if (error.error) {
      console.log('API 错误:', JSON.stringify(error.error, null, 2));
    }
  }
}

// 测试 SDK 导入
async function testSDKImport() {
  console.log('\n=== 测试 Anthropic SDK 导入 ===');
  try {
    const module = await import('@anthropic-ai/sdk');
    console.log('✅ @anthropic-ai/sdk 导入成功');
    console.log('📦 默认导出:', typeof module.default);

    // 检查 client 是否有 messages API
    const Anthropic = module.default;
    const mockClient = new Anthropic({ apiKey: 'test' });
    console.log('✅ Anthropic 客户端创建成功');
    console.log('✅ client.messages API 可用:', typeof mockClient.messages.create === 'function');
  } catch (error) {
    console.log('❌ SDK 导入失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('🚀 Playwright MCP 压缩功能 - 修复后诊断\n');

  await testSDKImport();
  await testCompressionWithOAuth();

  console.log('\n=== 诊断完成 ===\n');
}

main().catch(console.error);
