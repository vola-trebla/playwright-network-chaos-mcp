# playwright-network-chaos-mcp 🐸💥

An MCP server that gives AI agents **dynamic network chaos control** over Playwright browser sessions.

Your tests run on perfect networks. Your users don't. This MCP lets AI agents simulate API outages, inject latency, drop connections mid-flight, and block third-party resources — then assert whether the app handles it gracefully.

---

## 🤔 The Problem

CI environments have flawless connectivity. APIs respond in milliseconds. CDNs never go down. So your tests pass — and then production breaks when the payment service returns a 503, the network drops mid-checkout, or Google Analytics hangs for 8 seconds and freezes the page.

AI agents writing Playwright tests have no way to introduce or reason about network instability. They can't ask:

- 🙈 *Does the checkout page show an error state when the payment API fails?*
- 🙈 *Does the skeleton loader appear while the dashboard API is slow?*
- 🙈 *Does the app still work if all tracking scripts are blocked?*
- 🙈 *What happens if the network drops after the order is submitted but before the response arrives?*

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

> *"Check if the checkout page shows a proper error state when the payment API returns 503"*

> *"Simulate a 3 second API delay on the dashboard and verify the skeleton loader appears"*

> *"Block all analytics and tracking scripts and confirm the main content still loads"*

> *"Drop the order submission request mid-flight and check if the user sees an error message"*

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
