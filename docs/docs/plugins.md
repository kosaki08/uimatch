---
sidebar_position: 5
---

# Plugin Development

Extend UI Match with custom selector plugins.

## Overview

Plugins allow you to customize how UI Match resolves selectors. This enables integration with:

- Testing libraries (Testing Library, Playwright Test)
- Component libraries (Material-UI, Chakra UI)
- Framework-specific patterns (Vue, React, Angular)
- Custom data attributes or naming conventions

## SPI (Selector Plugin Interface)

UI Match uses a plugin system called SPI (Selector Plugin Interface) to resolve CSS selectors to DOM elements.

### Why Plugins?

Different projects use different selector strategies:

```typescript
// Testing Library style
getByRole('button', { name: 'Submit' });

// Playwright style
page.locator('[data-testid="submit-button"]');

// Component library style
page.locator('[data-mui-component="Button"][variant="contained"]');
```

Plugins let you use **your existing selectors** without changing your codebase.

## Creating a Plugin

### Minimal Example

Create a file `my-test-id-plugin.ts`:

```typescript
import type { SelectorResolverPlugin } from '@uimatch/selector-spi';

export const testIdPlugin: SelectorResolverPlugin = {
  name: 'test-id-selector',
  version: '1.0.0',

  async resolve(context) {
    const { initialSelector, probe } = context;

    // Convert simple name to data-testid selector
    const selector = `[data-testid="${initialSelector}"]`;

    // Verify selector is valid
    const probeResult = await probe.check(selector);
    if (!probeResult.isValid) {
      return {
        selector: initialSelector, // fallback to original
        reasons: ['data-testid selector not found, using original'],
        stabilityScore: 50,
      };
    }

    return {
      selector,
      reasons: ['Resolved via data-testid'],
      stabilityScore: 80,
    };
  },
};

export default testIdPlugin;
```

### Using Your Plugin

```bash
npx uimatch compare \
  figma=abc123:1-2 \
  story=http://localhost:3000 \
  selector=submit-button \
  --anchor ./my-test-id-plugin.ts
```

Now `selector=submit-button` resolves to `[data-testid="submit-button"]`.

## Advanced Plugin Examples

### Testing Library Plugin

Emulate Testing Library's query methods:

```typescript
import type { SelectorResolverPlugin } from '@uimatch/selector-spi';

interface TestingLibraryQuery {
  type: 'role' | 'text' | 'labelText' | 'testId';
  value: string;
  options?: Record<string, any>;
}

export const testingLibraryPlugin: SelectorResolverPlugin = {
  name: 'testing-library-selector',
  version: '1.0.0',

  async resolve(context) {
    const { initialSelector, probe } = context;
    const query = parseSelector(initialSelector);

    // Build appropriate selector based on query type
    let selector: string;
    switch (query.type) {
      case 'role':
        selector = `[role="${query.value}"]`;
        break;
      case 'text':
        selector = `:text("${query.value}")`;
        break;
      case 'labelText':
        selector = `label:has-text("${query.value}")`;
        break;
      case 'testId':
        selector = `[data-testid="${query.value}"]`;
        break;
      default:
        return {
          selector: initialSelector,
          reasons: [`Unknown query type: ${query.type}`],
          stabilityScore: 0,
        };
    }

    const probeResult = await probe.check(selector);
    if (!probeResult.isValid) {
      return {
        selector: initialSelector,
        reasons: ['Testing Library selector not found'],
        stabilityScore: 30,
      };
    }

    return {
      selector,
      reasons: [`Resolved via Testing Library ${query.type} query`],
      stabilityScore: 85,
    };
  },
};

function parseSelector(selector: string): TestingLibraryQuery {
  // Parse: "role:button[name=Submit]"
  const match = selector.match(/^(\w+):([^[]+)(?:\[(.+)\])?$/);
  if (!match) throw new Error(`Invalid selector: ${selector}`);

  const [, type, value, optionsStr] = match;
  const options = optionsStr ? parseOptions(optionsStr) : undefined;

  return { type: type as any, value, options };
}

function parseOptions(str: string): Record<string, any> {
  // Parse: "name=Submit,exact=true"
  return Object.fromEntries(
    str.split(',').map((pair) => {
      const [key, val] = pair.split('=');
      return [key.trim(), val === 'true' ? true : val === 'false' ? false : val];
    })
  );
}

export default testingLibraryPlugin;
```

**Usage:**

```bash
# Using role queries
selector="role:button[name=Submit]"

# Using text queries
selector="text:Click me"

# Using label text
selector="labelText:Email address"
```

### Component Library Plugin

Target specific component library attributes:

```typescript
import type { SelectorResolverPlugin } from '@uimatch/selector-spi';

export const muiPlugin: SelectorResolverPlugin = {
  name: 'material-ui-selector',
  version: '1.0.0',

  async resolve(context) {
    const { initialSelector, probe } = context;

    // Parse: "Button.contained.primary"
    const [component, ...variants] = initialSelector.split('.');

    // Build selector with component and variants
    let selector = `[data-mui-component="${component}"]`;
    for (const variant of variants) {
      selector += `[variant="${variant}"]`;
    }

    const probeResult = await probe.check(selector);
    if (!probeResult.isValid) {
      return {
        selector: initialSelector,
        reasons: ['MUI component not found'],
        stabilityScore: 40,
      };
    }

    return {
      selector,
      reasons: [`Resolved via MUI component: ${component}`],
      stabilityScore: 75,
    };
  },
};

export default muiPlugin;
```

**Usage:**

```bash
# Target MUI Button with contained variant
selector="Button.contained"

# Target MUI TextField with outlined variant
selector="TextField.outlined"
```

### Fallback Chain Plugin

Try multiple resolution strategies:

```typescript
import type { SelectorResolverPlugin } from '@uimatch/selector-spi';

export const fallbackPlugin: SelectorResolverPlugin = {
  name: 'fallback-selector',
  version: '1.0.0',

  async resolve(context) {
    const { initialSelector, probe } = context;

    // Try strategies in order
    const strategies = [
      { selector: `[data-testid="${initialSelector}"]`, name: 'data-testid', score: 90 },
      { selector: `[aria-label="${initialSelector}"]`, name: 'aria-label', score: 85 },
      { selector: initialSelector, name: 'CSS', score: 70 }, // Fallback to CSS
    ];

    for (const strategy of strategies) {
      const probeResult = await probe.check(strategy.selector);
      if (probeResult.isValid) {
        return {
          selector: strategy.selector,
          reasons: [`Resolved via ${strategy.name} strategy`],
          stabilityScore: strategy.score,
        };
      }
    }

    return {
      selector: initialSelector,
      reasons: ['No element found with any strategy'],
      stabilityScore: 0,
    };
  },
};

export default fallbackPlugin;
```

## Plugin API Reference

### SelectorResolverPlugin Interface

```typescript
interface SelectorResolverPlugin {
  /**
   * Plugin name/identifier
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Resolve a selector using the plugin's strategy
   *
   * @param context - Resolution context
   * @returns Resolution result
   */
  resolve(context: ResolveContext): Promise<Resolution>;

  /**
   * Optional: Check if the plugin is available and properly configured
   */
  healthCheck?(): Promise<HealthCheckResult>;
}

interface ResolveContext {
  /** URL of the page being tested */
  url: string;

  /** Initial selector provided by the user */
  initialSelector: string;

  /** Path to anchors JSON file (optional) */
  anchorsPath?: string;

  /** Whether to write back resolved selectors */
  writeBack?: boolean;

  /** Probe for lightweight liveness checks */
  probe: Probe;
}

interface Resolution {
  /** The resolved selector */
  selector: string;

  /** Stability score for the resolved selector (0-100) */
  stabilityScore?: number;

  /** Human-readable reasons for the resolution choice */
  reasons?: string[];
}

interface Probe {
  /**
   * Check if a selector is alive (exists and optionally visible)
   */
  check(selector: string, options?: ProbeOptions): Promise<ProbeResult>;
}
```

### Best Practices

#### 1. Always Use Probe for Validation

```typescript
async resolve(context) {
  const { initialSelector, probe } = context;
  const selector = transformSelector(initialSelector);

  // Validate element exists using probe
  const probeResult = await probe.check(selector);
  if (!probeResult.isValid) {
    return {
      selector: initialSelector,
      reasons: [`Element not found: ${selector}`],
      stabilityScore: 0,
    };
  }

  return {
    selector,
    reasons: ['Successfully resolved'],
    stabilityScore: 80,
  };
}
```

#### 2. Provide Meaningful Reasons

```typescript
async resolve(context) {
  const { initialSelector } = context;

  // Check format
  if (!initialSelector.match(/^role:.+/)) {
    return {
      selector: initialSelector,
      reasons: [`Invalid format. Expected "role:rolename", got "${initialSelector}"`],
      stabilityScore: 0,
    };
  }

  // ... rest of resolution logic
}
```

#### 3. Use Stability Scores

```typescript
async resolve(context) {
  const strategies = [
    { selector: `[data-testid="${context.initialSelector}"]`, score: 95 }, // Most stable
    { selector: `#${context.initialSelector}`, score: 80 },                // ID selector
    { selector: context.initialSelector, score: 60 },                      // Generic CSS
  ];

  for (const strategy of strategies) {
    const result = await context.probe.check(strategy.selector);
    if (result.isValid) {
      return {
        selector: strategy.selector,
        stabilityScore: strategy.score,
        reasons: [`Resolved with stability score ${strategy.score}`],
      };
    }
  }

  return {
    selector: context.initialSelector,
    stabilityScore: 0,
    reasons: ['No valid selector found'],
  };
}
```

## Publishing Plugins

### Package Structure

```
my-@uimatch/cli/
├── package.json
├── src/
│   └── index.ts
├── dist/
│   └── index.js
└── README.md
```

### package.json

```json
{
  "name": "@my-company/uimatch-testing-library-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@uimatch/selector-spi": "^1.0.0",
    "playwright": "^1.40.0"
  },
  "keywords": ["uimatch", "plugin", "testing-library"]
}
```

### Usage by Others

```bash
# Install
npm install @my-company/uimatch-testing-library-plugin

# Use
npx uimatch compare \
  ... \
  --anchor @my-company/uimatch-testing-library-plugin
```

## Testing Your Plugin

```typescript
import { test, expect } from '@playwright/test';
import { myPlugin } from './my-plugin';

test('plugin resolves data-testid', async ({ page }) => {
  await page.setContent('<button data-testid="submit">Click</button>');

  const locator = await myPlugin.resolve('submit', page);

  await expect(locator).toBeVisible();
  await expect(locator).toHaveText('Click');
});
```

## Common Patterns

### Dynamic Selector Generation

```typescript
async resolve(context) {
  const { initialSelector, probe } = context;

  // Support templates: "button:{id}"
  const selector = initialSelector.replace(/{(\w+)}/g, (_, key) => {
    return process.env[`SELECTOR_${key.toUpperCase()}`] || '';
  });

  const result = await probe.check(selector);
  if (!result.isValid) {
    return {
      selector: initialSelector,
      reasons: ['Template expansion failed'],
      stabilityScore: 0,
    };
  }

  return {
    selector,
    reasons: ['Resolved via template expansion'],
    stabilityScore: 70,
  };
}
```

### Contextual Selection

```typescript
async resolve(context) {
  const { initialSelector, probe } = context;

  // Support scoped selectors: "modal>button"
  const [scope, target] = initialSelector.split('>');

  const selector = target ? `${scope} ${target}` : initialSelector;

  const result = await probe.check(selector);
  if (!result.isValid) {
    return {
      selector: initialSelector,
      reasons: ['Scoped selector not found'],
      stabilityScore: 0,
    };
  }

  return {
    selector,
    reasons: target ? ['Resolved with scope'] : ['Direct selector'],
    stabilityScore: target ? 75 : 65,
  };
}
```

## Examples Repository

See the [examples directory](https://github.com/your-username/ui-match/tree/main/examples/plugins) for more plugin examples:

- **Storybook Plugin** - Target Storybook-specific selectors
- **Accessibility Plugin** - Use ARIA roles and labels
- **i18n Plugin** - Resolve by translated text keys
- **Shadow DOM Plugin** - Navigate shadow DOM boundaries

## See Also

- API Reference (in navigation menu) - Full TypeScript API documentation
- [Concepts](./concepts.md) - Understanding the anchor system
- [CLI Reference](./cli-reference.md) - Using plugins from CLI
