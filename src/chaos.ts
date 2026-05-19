import { Page } from 'playwright';
import {
  InterceptedRequest,
  PageState,
  ChaosResult,
  LatencyResult,
  BlockResult,
  SystemNetworkErrorResult,
  StatefulFailureResult,
  ResponseCorruptionResult,
} from './types.js';
import { withPage } from './browser.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_WAIT_MS = 2000;

function collectPageState(page: Page): { cleanup: () => void; getState: () => PageState } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };

  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  return {
    cleanup: () => {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    },
    getState: () => ({ page_errors: pageErrors, console_errors: consoleErrors }),
  };
}

async function checkSelector(page: Page, selector: string | null): Promise<boolean> {
  if (!selector) return false;
  return page
    .locator(selector)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
}

export async function simulateApiFailure(
  url: string,
  interceptPattern: string,
  statusCode: number,
  responseBody: string,
  fallbackSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<ChaosResult> {
  const intercepted: InterceptedRequest[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        intercepted.push({
          url: route.request().url(),
          method: route.request().method(),
          status: statusCode,
        });
        await route.fulfill({
          status: statusCode,
          body: responseBody,
          contentType: 'application/json',
        });
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const fallbackFound = await checkSelector(page, fallbackSelector);
        return {
          url,
          intercept_pattern: interceptPattern,
          intercepted_count: intercepted.length,
          intercepted_requests: intercepted,
          fallback_found: fallbackFound,
          fallback_selector: fallbackSelector,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function injectLatency(
  url: string,
  interceptPattern: string,
  latencyMs: number,
  jitterMs: number,
  loadingSelector: string | null,
  viewport = DEFAULT_VIEWPORT
): Promise<LatencyResult> {
  const intercepted: InterceptedRequest[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        const delay = latencyMs + Math.floor(Math.random() * (jitterMs + 1));
        intercepted.push({
          url: route.request().url(),
          method: route.request().method(),
          delay_ms: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
        await route.continue();
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        const loadingStateFound = await checkSelector(page, loadingSelector);
        await page.waitForLoadState('networkidle').catch(() => null);
        return {
          url,
          intercept_pattern: interceptPattern,
          intercepted_count: intercepted.length,
          intercepted_requests: intercepted,
          loading_state_found: loadingStateFound,
          page_state: getState(),
          load_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function blockResources(
  url: string,
  blockPatterns: string[],
  coreContentSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<BlockResult> {
  const blockedUrls: string[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      for (const pattern of blockPatterns) {
        await page.route(pattern, async (route) => {
          blockedUrls.push(route.request().url());
          await route.abort();
        });
      }
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const coreContentFound = await checkSelector(page, coreContentSelector);
        return {
          url,
          block_patterns: blockPatterns,
          blocked_count: blockedUrls.length,
          blocked_urls: blockedUrls,
          core_content_found: coreContentFound,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function simulateNetworkDrop(
  url: string,
  interceptPattern: string,
  dropAfterMs: number,
  fallbackSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<ChaosResult> {
  const intercepted: InterceptedRequest[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        intercepted.push({ url: route.request().url(), method: route.request().method() });
        await new Promise((r) => setTimeout(r, dropAfterMs));
        await route.abort('connectionaborted');
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const fallbackFound = await checkSelector(page, fallbackSelector);
        return {
          url,
          intercept_pattern: interceptPattern,
          intercepted_count: intercepted.length,
          intercepted_requests: intercepted,
          fallback_found: fallbackFound,
          fallback_selector: fallbackSelector,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function triggerSystemNetworkError(
  url: string,
  interceptPattern: string,
  errorCode: 'addressunreachable' | 'connectionaborted' | 'accessdenied' | 'aborted',
  fallbackSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<SystemNetworkErrorResult> {
  const intercepted: InterceptedRequest[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        intercepted.push({ url: route.request().url(), method: route.request().method() });
        await route.abort(errorCode);
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const fallbackFound = await checkSelector(page, fallbackSelector);
        return {
          url,
          intercept_pattern: interceptPattern,
          error_code: errorCode,
          intercepted_count: intercepted.length,
          intercepted_requests: intercepted,
          fallback_found: fallbackFound,
          fallback_selector: fallbackSelector,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function simulateStatefulFailure(
  url: string,
  interceptPattern: string,
  httpStatus: number,
  failureCount: number,
  successPayload: string,
  fallbackSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<StatefulFailureResult> {
  let counter = 0;
  const intercepted: Array<InterceptedRequest & { attempt: number; outcome: 'failed' | 'passed' }> =
    [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        const attempt = ++counter;
        if (attempt <= failureCount) {
          intercepted.push({
            url: route.request().url(),
            method: route.request().method(),
            status: httpStatus,
            attempt,
            outcome: 'failed',
          });
          await route.fulfill({ status: httpStatus, body: '{"error":"simulated failure"}' });
        } else {
          intercepted.push({
            url: route.request().url(),
            method: route.request().method(),
            status: 200,
            attempt,
            outcome: 'passed',
          });
          await route.fulfill({
            status: 200,
            body: successPayload,
            contentType: 'application/json',
          });
        }
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const fallbackFound = await checkSelector(page, fallbackSelector);
        const actualFailed = intercepted.filter((r) => r.outcome === 'failed').length;
        return {
          url,
          intercept_pattern: interceptPattern,
          http_status: httpStatus,
          failure_count: failureCount,
          actual_failed: actualFailed,
          actual_succeeded: intercepted.length - actualFailed,
          intercepted_requests: intercepted,
          fallback_found: fallbackFound,
          fallback_selector: fallbackSelector,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export async function injectResponseCorruption(
  url: string,
  interceptPattern: string,
  corruptionType: 'length_mismatch' | 'malformed_json' | 'truncated',
  truncateAtByte: number,
  fallbackSelector: string | null,
  waitMs: number,
  viewport = DEFAULT_VIEWPORT
): Promise<ResponseCorruptionResult> {
  const intercepted: InterceptedRequest[] = [];

  return withPage(
    url,
    viewport,
    async (page) => {
      await page.route(interceptPattern, async (route) => {
        intercepted.push({ url: route.request().url(), method: route.request().method() });

        if (corruptionType === 'malformed_json') {
          await route.fulfill({
            status: 200,
            body: '{"error": unterminated',
            contentType: 'application/json',
          });
        } else if (corruptionType === 'length_mismatch') {
          await route.fulfill({
            status: 200,
            body: '{"ok":true}',
            headers: { 'content-length': '99999', 'content-type': 'application/json' },
          });
        } else {
          const full = '{"data":"' + 'a'.repeat(200) + '"}';
          const truncated = Buffer.from(full).slice(0, truncateAtByte);
          await route.fulfill({
            status: 200,
            body: truncated,
            contentType: 'application/json',
          });
        }
      });
    },
    async (page) => {
      const { getState, cleanup } = collectPageState(page);
      const start = Date.now();
      try {
        await page.waitForTimeout(waitMs);
        const fallbackFound = await checkSelector(page, fallbackSelector);
        return {
          url,
          intercept_pattern: interceptPattern,
          corruption_type: corruptionType,
          intercepted_count: intercepted.length,
          intercepted_requests: intercepted,
          fallback_found: fallbackFound,
          fallback_selector: fallbackSelector,
          page_state: getState(),
          wait_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export { DEFAULT_WAIT_MS };
