import { Page } from "playwright";
import { InterceptedRequest, PageState, ChaosResult, LatencyResult, BlockResult } from "./types.js";
import { withPage } from "./browser.js";

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_WAIT_MS = 2000;

function collectPageState(page: Page): { cleanup: () => void; getState: () => PageState } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const onPageError = (err: Error) => pageErrors.push(err.message);
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  return {
    cleanup: () => {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
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
          contentType: "application/json",
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
          load_time_ms: Date.now() - start,
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
        await page.waitForLoadState("networkidle").catch(() => null);
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
          load_time_ms: Date.now() - start,
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
        await route.abort("connectionaborted");
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
          load_time_ms: Date.now() - start,
        };
      } finally {
        cleanup();
      }
    }
  );
}

export { DEFAULT_WAIT_MS };
