#!/usr/bin/env node
// stdio 入口：npm 包 bin（narracore-format）。stdout 只走 MCP 协议帧，
// 未捕获异常写 stderr 后以非零码退出（生产禁假实现——不吞错）。
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './server';

async function main(): Promise<void> {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error('[narracore-format] fatal:', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
