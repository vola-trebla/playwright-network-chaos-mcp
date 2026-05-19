# playwright-network-chaos-mcp 🐸💥

[![npm version](https://img.shields.io/npm/v/playwright-network-chaos-mcp.svg)](https://www.npmjs.com/package/playwright-network-chaos-mcp)
[![npm downloads](https://img.shields.io/npm/dm/playwright-network-chaos-mcp.svg)](https://www.npmjs.com/package/playwright-network-chaos-mcp)
[![CI](https://github.com/vola-trebla/playwright-network-chaos-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/vola-trebla/playwright-network-chaos-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that gives AI agents **dynamic network chaos control** over Playwright browser sessions.

Your tests run on perfect networks. Your users don't. This MCP lets AI agents simulate API outages, inject latency, drop connections mid-flight, and block third-party resources — then assert whether the app handles it gracefully.

---

## 🤔 The Problem

CI environments have flawless connectivity. APIs respond in milliseconds. CDNs never go down. So your tests pass — and then production breaks when the payment service returns a 503, the network drops mid-checkout, or Google Analytics hangs for 8 seconds and freezes the page.

AI agents writing Playwright tests have no way to introduce or reason about network instability. They can't ask:

- 🙈 _Does the checkout page show an error state when the payment API fails?_
- 🙈 _Does the skeleton loader appear while the dashboard API is slow?_
- 🙈 _Does the app still work if all tracking scripts are blocked?_
- 🙈 _What happens if the network drops after the order is submitted but before the response arrives?_

`playwright-network-chaos-mcp` fixes that.

---

## 🛠️ Tools

### `simulate_api_failure`

Intercepts requests matching a pattern and forces them to return an error status code. Checks if the app shows a fallback UI.

```json
{
  "url": "https://your-app.com/checkout",
  "intercept_pattern": "**/api/payment**",
  "status_code": 503,
  "fallback_selector": ".error-boundary",
  "wait_ms": 2000
}
```

```json
{
  "intercepted_count": 2,
  "fallback_found": true,
  "fallback_selector": ".error-boundary",
  "page_state": {
    "page_errors": [],
    "console_errors": ["Failed to load resource: 503"]
  }
}
```

---

### `inject_latency`

Adds artificial delay to matching requests. Checks if loading states appear while the app waits.

```json
{
  "url": "https://your-app.com/dashboard",
  "intercept_pattern": "**/api/**",
  "latency_ms": 3000,
  "jitter_ms": 500,
  "loading_selector": ".skeleton-loader"
}
```

```json
{
  "intercepted_count": 4,
  "intercepted_requests": [
    { "url": "https://api.your-app.com/users", "method": "GET", "delay_ms": 3241 }
  ],
  "loading_state_found": true,
  "load_time_ms": 3890
}
```

---

### `block_resources`

Aborts requests to specified URL patterns — for testing third-party outages (analytics, CDNs, tracking pixels).

```json
{
  "url": "https://your-app.com",
  "block_patterns": ["**/analytics**", "*.doubleclick.net/**", "**/hotjar**"],
  "core_content_selector": ".main-content",
  "wait_ms": 2000
}
```

```json
{
  "blocked_count": 7,
  "blocked_urls": ["https://www.google-analytics.com/analytics.js", "..."],
  "core_content_found": true,
  "page_state": { "page_errors": [], "console_errors": [] }
}
```

---

### `simulate_network_drop`

Aborts requests mid-flight after a delay — simulating connection loss between request and response.

```json
{
  "url": "https://your-app.com/checkout",
  "intercept_pattern": "**/api/order**",
  "drop_after_ms": 800,
  "fallback_selector": ".network-error-toast",
  "wait_ms": 3000
}
```

```json
{
  "intercepted_count": 1,
  "fallback_found": true,
  "fallback_selector": ".network-error-toast",
  "page_state": { "page_errors": ["TypeError: Failed to fetch"] }
}
```

---

### `trigger_system_network_error`

Aborts requests with an OS-level error code — simulating DNS failures, firewall blocks, and connection resets.

```json
{
  "url": "https://your-app.com/dashboard",
  "intercept_pattern": "**/api/**",
  "error_code": "addressunreachable",
  "fallback_selector": ".network-error"
}
```

```json
{
  "error_code": "addressunreachable",
  "intercepted_count": 3,
  "fallback_found": true,
  "page_state": { "page_errors": [], "console_errors": ["net::ERR_ADDRESS_UNREACHABLE"] }
}
```

---

### `simulate_stateful_failure`

Fails the first N requests then lets subsequent ones succeed — testing retry logic and recovery flows.

```json
{
  "url": "https://your-app.com/dashboard",
  "intercept_pattern": "**/api/data**",
  "http_status": 503,
  "failure_count": 2,
  "success_payload": "{\"data\":[]}",
  "fallback_selector": ".retry-button"
}
```

```json
{
  "failure_count": 2,
  "actual_failed": 2,
  "actual_succeeded": 1,
  "intercepted_requests": [
    { "url": "...", "method": "GET", "status": 503, "attempt": 1, "outcome": "failed" },
    { "url": "...", "method": "GET", "status": 200, "attempt": 3, "outcome": "passed" }
  ],
  "fallback_found": true
}
```

---

### `inject_response_corruption`

Serves malformed responses at the protocol level — unterminated JSON, content-length lies, or truncated payloads.

```json
{
  "url": "https://your-app.com/checkout",
  "intercept_pattern": "**/api/order**",
  "corruption_type": "malformed_json",
  "fallback_selector": ".parse-error"
}
```

```json
{
  "corruption_type": "malformed_json",
  "intercepted_count": 1,
  "fallback_found": false,
  "page_state": { "page_errors": ["SyntaxError: Unexpected token u in JSON"] }
}
```

---

### `assert_chaos_handled`

Injects a chaos HTTP status and returns a structured pass/fail verdict — `chaos_survived` is true only when the fallback UI appears and there are no unhandled JS exceptions.

```json
{
  "url": "https://your-app.com/checkout",
  "intercept_pattern": "**/api/**",
  "http_status": 500,
  "expected_fallback_selector": ".error-boundary"
}
```

```json
{
  "http_status": 500,
  "unhandled_exceptions": [],
  "console_errors": ["Failed to load resource: 500"],
  "fallback_ui_detected": true,
  "chaos_survived": true
}
```

---

## 🚀 Installation

```bash
npx playwright-network-chaos-mcp
```

Or install globally:

```bash
npm install -g playwright-network-chaos-mcp
npx playwright install chromium
```

### Claude Desktop config

```json
{
  "mcpServers": {
    "playwright-network-chaos-mcp": {
      "command": "npx",
      "args": ["-y", "playwright-network-chaos-mcp"]
    }
  }
}
```

---

## 💡 Example Agent Prompts

> _"Check if the checkout page shows a proper error state when the payment API returns 503"_

> _"Simulate a 3 second API delay on the dashboard and verify the skeleton loader appears"_

> _"Block all analytics and tracking scripts and confirm the main content still loads"_

> _"Drop the order submission request mid-flight and check if the user sees an error message"_

> _"Simulate DNS failure for the API and check if the error boundary renders"_

> _"Fail the first 3 requests then succeed — does the app retry and recover automatically?"_

> _"Inject malformed JSON and assert the app doesn't crash — return a chaos verdict"_

---

## 🔗 Related Projects

- [playwright-trace-decoder-mcp](https://github.com/vola-trebla/playwright-trace-decoder-mcp) — root-cause analysis of CI failures from Playwright traces
- [flakiness-knowledge-graph-mcp](https://github.com/vola-trebla/flakiness-knowledge-graph-mcp) — knowledge graph of flaky test patterns
- [ast-impact-mapper-mcp](https://github.com/vola-trebla/ast-impact-mapper-mcp) — find affected tests from code changes via TypeScript AST
- [zod-contract-mock-forge-mcp](https://github.com/vola-trebla/zod-contract-mock-forge-mcp) — deterministic mock generation from Zod schemas
- [playwright-spatial-layout-mcp](https://github.com/vola-trebla/playwright-spatial-layout-mcp) — geometric spatial awareness of web layouts

---

## 📄 License

MIT © [vola-trebla](https://github.com/vola-trebla)
