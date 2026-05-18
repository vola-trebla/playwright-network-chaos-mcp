#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  simulateApiFailure,
  injectLatency,
  blockResources,
  simulateNetworkDrop,
  DEFAULT_WAIT_MS,
} from './chaos.js';
import { closeBrowser } from './browser.js';

const server = new McpServer({
  name: 'playwright-network-chaos-mcp',
  version: '0.1.0',
});

const viewportSchema = z
  .object({
    width: z.number().int().min(320).max(3840).describe('Viewport width in px'),
    height: z.number().int().min(240).max(2160).describe('Viewport height in px'),
  })
  .optional()
  .describe('Viewport size (default: 1280×720)');

function errorResponse(err: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

server.registerTool(
  'simulate_api_failure',
  {
    description:
      'Intercepts API requests matching a URL pattern and makes them return an error status code. ' +
      'Navigates to the page and checks if a fallback UI element appears. ' +
      'Use to answer: does the app show a proper error state when the payment API returns 503?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to intercept (e.g., '**/api/payment**')"),
      status_code: z
        .number()
        .int()
        .min(400)
        .max(599)
        .default(503)
        .describe('HTTP error status code to return (default: 503)'),
      response_body: z
        .string()
        .default('{"error":"Service Unavailable"}')
        .describe('Response body to return for intercepted requests'),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.error-boundary')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe(
          'Milliseconds to wait after navigation before checking the fallback (default: 2000)'
        ),
      viewport: viewportSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    status_code,
    response_body,
    fallback_selector,
    wait_ms,
    viewport,
  }) => {
    try {
      const result = await simulateApiFailure(
        url,
        intercept_pattern,
        status_code,
        response_body,
        fallback_selector ?? null,
        wait_ms,
        viewport
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'inject_latency',
  {
    description:
      'Adds artificial delay to requests matching a URL pattern, simulating slow networks or overloaded APIs. ' +
      'Use to answer: does the app show loading states when the API takes 3 seconds? Does it time out gracefully?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to delay (e.g., '**/api/**')"),
      latency_ms: z
        .number()
        .int()
        .min(0)
        .max(30000)
        .default(3000)
        .describe('Base delay in milliseconds to add to each matched request (default: 3000)'),
      jitter_ms: z
        .number()
        .int()
        .min(0)
        .max(5000)
        .default(0)
        .describe('Random additional delay in milliseconds (default: 0)'),
      loading_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for the loading state that should appear (e.g., '.skeleton-loader')"
        ),
      viewport: viewportSchema,
    },
  },
  async ({ url, intercept_pattern, latency_ms, jitter_ms, loading_selector, viewport }) => {
    try {
      const result = await injectLatency(
        url,
        intercept_pattern,
        latency_ms,
        jitter_ms,
        loading_selector ?? null,
        viewport
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'block_resources',
  {
    description:
      'Blocks requests to specified URL patterns — useful for simulating third-party outages (analytics, CDNs, tracking). ' +
      'Use to answer: does the app still load and function if Google Analytics or a CDN is down?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      block_patterns: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe(
          "Glob patterns for requests to block (e.g., ['**/analytics**', '*.doubleclick.net/**'])"
        ),
      core_content_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for core content that must still be present (e.g., '.main-content')"
        ),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe(
          'Milliseconds to wait after navigation before checking core content (default: 2000)'
        ),
      viewport: viewportSchema,
    },
  },
  async ({ url, block_patterns, core_content_selector, wait_ms, viewport }) => {
    try {
      const result = await blockResources(
        url,
        block_patterns,
        core_content_selector ?? null,
        wait_ms,
        viewport
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'simulate_network_drop',
  {
    description:
      'Aborts requests matching a pattern after a delay, simulating a mid-flight connection drop. ' +
      'Use to answer: what happens if the network drops after the order request is sent but before the response arrives?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to drop (e.g., '**/api/order**')"),
      drop_after_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(500)
        .describe(
          'Milliseconds to wait before aborting the request, simulating mid-flight drop (default: 500)'
        ),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.timeout-error')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe('Milliseconds to wait after navigation before checking fallback (default: 2000)'),
      viewport: viewportSchema,
    },
  },
  async ({ url, intercept_pattern, drop_after_ms, fallback_selector, wait_ms, viewport }) => {
    try {
      const result = await simulateNetworkDrop(
        url,
        intercept_pattern,
        drop_after_ms,
        fallback_selector ?? null,
        wait_ms,
        viewport
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const shutdown = async () => {
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
