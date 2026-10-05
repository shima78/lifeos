/**
 * MCP entry point (stdio). Boots the same Nest modules as the HTTP API, without an HTTP server,
 * and exposes the services as MCP tools for Claude Desktop / Claude Code.
 *
 * stdout carries the MCP protocol, so nothing else may write to it: Nest logging is disabled
 * and diagnostics go to stderr.
 */
import 'reflect-metadata';
import { loadEnv } from './common/load-env';

loadEnv();

import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppModule } from './app.module';
import { createMcpServer } from './mcp/mcp-server';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const server = createMcpServer(app);

  const shutdown = async () => {
    await server.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.stdin.on('close', () => void shutdown());

  await server.connect(new StdioServerTransport());
  console.error('LifeOS MCP server ready (stdio)');
}

main().catch((err: unknown) => {
  console.error('LifeOS MCP server failed to start:', err);
  process.exit(1);
});
