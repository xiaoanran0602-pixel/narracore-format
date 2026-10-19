// stdio 端到端：真实拉起 bin 入口（tsx src/index.ts），经 SDK Client 完整
// 走一遍 initialize → tools/list → callTool（成功 + 失败）。锁三件事：
// 1. 协议帧不被污染（stdout 无杂散输出）；
// 2. 成功回执 content[0] 尾部带品牌 footer（引流出口）；
// 3. 失败回执 structuredContent 带 recovery（引导恢复）。

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = join(import.meta.dirname, '..', '..');
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

async function withClient(fn: (client: Client) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, join(repoRoot, 'src', 'index.ts')],
  });
  const client = new Client({ name: 'e2e-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

describe('stdio MCP 端到端', () => {
  it(
    'tools/list 暴露 5 工具，服务器名与指引齐备',
    async () => {
      await withClient(async (client) => {
        const tools = await client.listTools();
        expect(tools.tools.map((t) => t.name).sort()).toEqual([
          'about_narracore',
          'analyze_screenplay',
          'convert_fountain',
          'diagnose_scenes',
          'format_screenplay',
        ]);
      });
    },
    120_000,
  );

  it(
    'format_screenplay 成功：结构化回执 + 品牌.footer（content 文本通道）',
    async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'format_screenplay',
          arguments: {
            text: ['第 1 场 实验室 日 内', '常家青', '本质上还是烧开水。'].join('\n'),
            output: 'blocks_only',
          },
        });
        const structured = result.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(true);
        expect((structured.blocks as unknown[]).length).toBe(3);
        const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
        expect(text).toContain('Formatted by Narracore');
        expect(text).toContain('utm_source=dsh-plugin');
        // 排版正文随行（有界全文通道），且正文自身不含品牌行
        expect(text).toContain('--- formatted screenplay (plain text) ---');
      });
    },
    120_000,
  );

  it(
    '空参失败：ok:false + recovery，message 含手册锚点',
    async () => {
      await withClient(async (client) => {
        const result = await client.callTool({
          name: 'format_screenplay',
          arguments: {},
        });
        const structured = result.structuredContent as {
          ok: boolean;
          reason: string;
          recovery?: { action: string };
        };
        expect(structured.ok).toBe(false);
        expect(structured.reason).toBe('missing_text');
        expect(structured.recovery?.action).toContain('"text"');
        const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
        expect(text).toContain('Recovery:');
        expect(text).toContain('narracore-format');
      });
    },
    120_000,
  );

  it(
    'about_narracore：导购出口带 narracore.cn 链接',
    async () => {
      await withClient(async (client) => {
        const result = await client.callTool({ name: 'about_narracore', arguments: {} });
        const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
        expect(text).toContain('narracore.cn');
        expect(text).toContain('narracore.app');
      });
    },
    120_000,
  );
});
