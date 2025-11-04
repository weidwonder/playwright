# 🎭 Playwright

[![npm version](https://img.shields.io/npm/v/playwright.svg)](https://www.npmjs.com/package/playwright) <!-- GEN:chromium-version-badge -->[![Chromium version](https://img.shields.io/badge/chromium-142.0.7444.53-blue.svg?logo=google-chrome)](https://www.chromium.org/Home)<!-- GEN:stop --> <!-- GEN:firefox-version-badge -->[![Firefox version](https://img.shields.io/badge/firefox-142.0.1-blue.svg?logo=firefoxbrowser)](https://www.mozilla.org/en-US/firefox/new/)<!-- GEN:stop --> <!-- GEN:webkit-version-badge -->[![WebKit version](https://img.shields.io/badge/webkit-26.0-blue.svg?logo=safari)](https://webkit.org/)<!-- GEN:stop --> [![Join Discord](https://img.shields.io/badge/join-discord-informational)](https://aka.ms/playwright/discord)

---

## 🔧 Custom Modifications (weidwonder's Fork)

This fork includes the following enhancements to the official Playwright MCP server:

### ✨ New Features

#### 1. **Enhanced Network Request Monitoring** 🔍

Powerful network request monitoring for AI-powered web scraping and API analysis.

##### `browser_network_requests` (Enhanced)
- **Added**: Unique request IDs (`req_0`, `req_1`, etc.) for easy reference
- **Added**: Type filtering parameter
  - `type: 'xhr'` - Only XHR/Fetch requests (API calls)
  - `type: 'all'` - All requests including images, CSS, scripts (default)
- **Usage**:
  ```javascript
  // Get only API calls
  await callTool({
    name: 'browser_network_requests',
    arguments: { type: 'xhr' }
  });
  // Output: [req_0] [POST] https://api.example.com/login => [200] OK
  ```

##### `browser_network_request_detail` (New)
Inspect complete request/response details by request ID.

- **Location**: `packages/playwright/src/mcp/browser/tools/network.ts`
- **Functionality**:
  - Request headers, body, and URL
  - Response headers, body (auto-formatted JSON), and status
  - Smart size limiting (>10KB bodies are omitted)
- **Usage**:
  ```javascript
  await callTool({
    name: 'browser_network_request_detail',
    arguments: { id: 'req_0' }
  });
  ```
- **Use Cases**:
  - Analyze login flows for web scraping
  - Debug authentication issues
  - Reverse engineer API endpoints
  - Document API structures
- **Tests**: `tests/mcp/network.spec.ts` (4 passing tests)

**Modified Files:**
- `packages/playwright/src/mcp/browser/tab.ts` - Request ID tracking
- `packages/playwright/src/mcp/browser/tools/network.ts` - Enhanced tools
- See `MCP_NETWORK_FEATURE_GUIDE.md` for detailed documentation

#### 2. **`browser_get_selector` Tool**
A new MCP tool that converts element references from page snapshots to standard CSS selectors or XPath expressions.

- **Location**: `packages/playwright/src/mcp/browser/tools/selector.ts`
- **Functionality**:
  - Input: Element `ref` from accessibility snapshot
  - Output: CSS selector and/or XPath
  - Supports dynamic JavaScript-rendered elements
- **Usage**:
  ```javascript
  await callTool({
    name: 'browser_get_selector',
    arguments: {
      ref: 'e5',           // Element reference from snapshot
      type: 'both'         // 'css', 'xpath', or 'both'
    }
  });
  ```
- **Dependencies**: Uses [`playwright-dompath`](https://github.com/alexferrari88/playwright-dompath) for accurate selector generation
- **Tests**: `tests/mcp/selector.spec.ts` (4 passing tests)

### 📁 Configuration Files

Two pre-configured setups for optimal MCP server performance:

- **`playwright-mcp-fast.json`** - Production configuration
  - Headless mode with aggressive optimizations
  - ~60-70% performance improvement
  - Ideal for automated workflows and CI/CD

- **`playwright-mcp-debug.json`** - Development configuration
  - Headed mode for visual debugging
  - Extended timeouts for troubleshooting
  - Minimal optimizations for maximum compatibility

**Usage**:
```bash
node packages/playwright/cli.js run-mcp-server --config playwright-mcp-fast.json
```

### 📝 Modified Files

**Network Monitoring:**
- `packages/playwright/src/mcp/browser/tab.ts` (request ID tracking)
- `packages/playwright/src/mcp/browser/tools/network.ts` (enhanced tools + new detail tool)
- `tests/mcp/network.spec.ts` (updated tests)
- `MCP_NETWORK_FEATURE_GUIDE.md` (comprehensive guide)

**Selector Tool:**
- `packages/playwright/src/mcp/browser/tools/selector.ts` (new)
- `packages/playwright/src/mcp/browser/tools.ts` (register new tool)
- `tests/mcp/selector.spec.ts` (new - 4 tests)
- `tests/mcp/selector-simple-dynamic.spec.ts` (new - dynamic element test)

**Dependencies:**
- `package.json` (added `playwright-dompath`)
- `package-lock.json` (dependency updates)

**Configuration & Documentation:**
- `playwright-mcp-fast.json` (production optimized config)
- `playwright-mcp-debug.json` (development debug config)
- `README.md` (this file - fork documentation)

### 🚀 Quick Start with Modifications

#### Local Development Setup

```bash
# Clone your fork
git clone https://github.com/weidwonder/playwright.git
cd playwright

# Install dependencies (includes playwright-dompath)
npm ci

# Build the project
npm run build

# Install browsers
npx playwright install

# Run MCP server with fast configuration
node packages/playwright/cli.js run-mcp-server --config playwright-mcp-fast.json

# Run tests
npm run ctest-mcp -- tests/mcp/selector.spec.ts
```

#### Configuration for MCP Clients

##### Claude Desktop

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "playwright-dev": {
      "command": "node",
      "args": [
        "<path-to-playwright-repo>/packages/playwright/cli.js",
        "run-mcp-server",
        "--config",
        "<path-to-playwright-repo>/playwright-mcp-fast.json"
      ],
      "env": {
        "NODE_PATH": "<path-to-playwright-repo>/node_modules"
      }
    }
  }
}
```

Replace `<path-to-playwright-repo>` with your actual path, for example:
- macOS/Linux: `/Users/username/projects/playwright` or `~/projects/playwright`
- Windows: `C:\Users\username\projects\playwright`

##### Claude Code (CLI)

Add the MCP server using the Claude Code CLI:

```bash
# Navigate to your playwright repository
cd /path/to/playwright

# Add MCP server with fast configuration
claude-code mcp add playwright-dev \
  --command "node" \
  --args "$(pwd)/packages/playwright/cli.js" \
  --args "run-mcp-server" \
  --args "--config" \
  --args "$(pwd)/playwright-mcp-fast.json" \
  --env "NODE_PATH=$(pwd)/node_modules"

# Or for debug configuration (with visible browser)
claude-code mcp add playwright-debug \
  --command "node" \
  --args "$(pwd)/packages/playwright/cli.js" \
  --args "run-mcp-server" \
  --args "--config" \
  --args "$(pwd)/playwright-mcp-debug.json" \
  --env "NODE_PATH=$(pwd)/node_modules"
```

##### Other MCP Clients

For VS Code, Cline, Cursor, or other MCP clients, use similar configuration with:
- **Command**: `node`
- **Args**:
  - `<path-to-repo>/packages/playwright/cli.js`
  - `run-mcp-server`
  - `--config`
  - `<path-to-repo>/playwright-mcp-fast.json`
- **Environment**: `NODE_PATH=<path-to-repo>/node_modules`

#### Switching Between Configurations

Use `playwright-mcp-fast.json` for production (faster):
```bash
# ~60-70% faster, headless mode
node packages/playwright/cli.js run-mcp-server --config playwright-mcp-fast.json
```

Use `playwright-mcp-debug.json` for debugging (visible browser):
```bash
# Slower but you can see what's happening
node packages/playwright/cli.js run-mcp-server --config playwright-mcp-debug.json
```

### 🔗 Upstream

This fork is based on [microsoft/playwright](https://github.com/microsoft/playwright).

To sync with upstream:
```bash
git remote add upstream https://github.com/microsoft/playwright.git
git fetch upstream
git merge upstream/main
```

---

## [Documentation](https://playwright.dev) | [API reference](https://playwright.dev/docs/api/class-playwright)

Playwright is a framework for Web Testing and Automation. It allows testing [Chromium](https://www.chromium.org/Home), [Firefox](https://www.mozilla.org/en-US/firefox/new/) and [WebKit](https://webkit.org/) with a single API. Playwright is built to enable cross-browser web automation that is **ever-green**, **capable**, **reliable** and **fast**.

|          | Linux | macOS | Windows |
|   :---   | :---: | :---: | :---:   |
| Chromium <!-- GEN:chromium-version -->142.0.7444.53<!-- GEN:stop --> | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| WebKit <!-- GEN:webkit-version -->26.0<!-- GEN:stop --> | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Firefox <!-- GEN:firefox-version -->142.0.1<!-- GEN:stop --> | :white_check_mark: | :white_check_mark: | :white_check_mark: |

Headless execution is supported for all browsers on all platforms. Check out [system requirements](https://playwright.dev/docs/intro#system-requirements) for details.

Looking for Playwright for [Python](https://playwright.dev/python/docs/intro), [.NET](https://playwright.dev/dotnet/docs/intro), or [Java](https://playwright.dev/java/docs/intro)?

## Installation

Playwright has its own test runner for end-to-end tests, we call it Playwright Test.

### Using init command

The easiest way to get started with Playwright Test is to run the init command.

```Shell
# Run from your project's root directory
npm init playwright@latest
# Or create a new project
npm init playwright@latest new-project
```

This will create a configuration file, optionally add examples, a GitHub Action workflow and a first test example.spec.ts. You can now jump directly to writing assertions section.

### Manually

Add dependency and install browsers.

```Shell
npm i -D @playwright/test
# install supported browsers
npx playwright install
```

You can optionally install only selected browsers, see [install browsers](https://playwright.dev/docs/cli#install-browsers) for more details. Or you can install no browsers at all and use existing [browser channels](https://playwright.dev/docs/browsers).

* [Getting started](https://playwright.dev/docs/intro)
* [API reference](https://playwright.dev/docs/api/class-playwright)

## Capabilities

### Resilient • No flaky tests

**Auto-wait**. Playwright waits for elements to be actionable prior to performing actions. It also has a rich set of introspection events. The combination of the two eliminates the need for artificial timeouts - a primary cause of flaky tests.

**Web-first assertions**. Playwright assertions are created specifically for the dynamic web. Checks are automatically retried until the necessary conditions are met.

**Tracing**. Configure test retry strategy, capture execution trace, videos and screenshots to eliminate flakes.

### No trade-offs • No limits

Browsers run web content belonging to different origins in different processes. Playwright is aligned with the architecture of the modern browsers and runs tests out-of-process. This makes Playwright free of the typical in-process test runner limitations.

**Multiple everything**. Test scenarios that span multiple tabs, multiple origins and multiple users. Create scenarios with different contexts for different users and run them against your server, all in one test.

**Trusted events**. Hover elements, interact with dynamic controls and produce trusted events. Playwright uses real browser input pipeline indistinguishable from the real user.

Test frames, pierce Shadow DOM. Playwright selectors pierce shadow DOM and allow entering frames seamlessly.

### Full isolation • Fast execution

**Browser contexts**. Playwright creates a browser context for each test. Browser context is equivalent to a brand new browser profile. This delivers full test isolation with zero overhead. Creating a new browser context only takes a handful of milliseconds.

**Log in once**. Save the authentication state of the context and reuse it in all the tests. This bypasses repetitive log-in operations in each test, yet delivers full isolation of independent tests.

### Powerful Tooling

**[Codegen](https://playwright.dev/docs/codegen)**. Generate tests by recording your actions. Save them into any language.

**[Playwright inspector](https://playwright.dev/docs/inspector)**. Inspect page, generate selectors, step through the test execution, see click points and explore execution logs.

**[Trace Viewer](https://playwright.dev/docs/trace-viewer)**. Capture all the information to investigate the test failure. Playwright trace contains test execution screencast, live DOM snapshots, action explorer, test source and many more.

Looking for Playwright for [TypeScript](https://playwright.dev/docs/intro), [JavaScript](https://playwright.dev/docs/intro), [Python](https://playwright.dev/python/docs/intro), [.NET](https://playwright.dev/dotnet/docs/intro), or [Java](https://playwright.dev/java/docs/intro)?

## Examples

To learn how to run these Playwright Test examples, check out our [getting started docs](https://playwright.dev/docs/intro).

#### Page screenshot

This code snippet navigates to Playwright homepage and saves a screenshot.

```TypeScript
import { test } from '@playwright/test';

test('Page Screenshot', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await page.screenshot({ path: `example.png` });
});
```

#### Mobile and geolocation

This snippet emulates Mobile Safari on a device at given geolocation, navigates to maps.google.com, performs the action and takes a screenshot.

```TypeScript
import { test, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13 Pro'],
  locale: 'en-US',
  geolocation: { longitude: 12.492507, latitude: 41.889938 },
  permissions: ['geolocation'],
})

test('Mobile and geolocation', async ({ page }) => {
  await page.goto('https://maps.google.com');
  await page.getByText('Your location').click();
  await page.waitForRequest(/.*preview\/pwa/);
  await page.screenshot({ path: 'colosseum-iphone.png' });
});
```

#### Evaluate in browser context

This code snippet navigates to example.com, and executes a script in the page context.

```TypeScript
import { test } from '@playwright/test';

test('Evaluate in browser context', async ({ page }) => {
  await page.goto('https://www.example.com/');
  const dimensions = await page.evaluate(() => {
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      deviceScaleFactor: window.devicePixelRatio
    }
  });
  console.log(dimensions);
});
```

#### Intercept network requests

This code snippet sets up request routing for a page to log all network requests.

```TypeScript
import { test } from '@playwright/test';

test('Intercept network requests', async ({ page }) => {
  // Log and continue all network requests
  await page.route('**', route => {
    console.log(route.request().url());
    route.continue();
  });
  await page.goto('http://todomvc.com');
});
```

## Resources

* [Documentation](https://playwright.dev)
* [API reference](https://playwright.dev/docs/api/class-playwright/)
* [Contribution guide](CONTRIBUTING.md)
* [Changelog](https://github.com/microsoft/playwright/releases)
