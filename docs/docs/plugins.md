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
import { SelectorPlugin } from '@uimatch/selector-spi';
import { Page, Locator } from 'playwright';

export const testIdPlugin: SelectorPlugin = {
  name: 'test-id-selector',

  resolve: async (selector: string, page: Page): Promise<Locator> => {
    // Convert simple name to data-testid selector
    return page.locator(`[data-testid="${selector}"]`);
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
import { SelectorPlugin } from '@uimatch/selector-spi';
import { Page, Locator } from 'playwright';

interface TestingLibraryQuery {
  type: 'role' | 'text' | 'labelText' | 'testId';
  value: string;
  options?: Record<string, any>;
}

export const testingLibraryPlugin: SelectorPlugin = {
  name: 'testing-library-selector',

  resolve: async (selector: string, page: Page): Promise<Locator> => {
    const query = parseSelector(selector);

    switch (query.type) {
      case 'role':
        return page.getByRole(query.value as any, query.options);
      case 'text':
        return page.getByText(query.value, query.options);
      case 'labelText':
        return page.getByLabel(query.value, query.options);
      case 'testId':
        return page.getByTestId(query.value);
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }
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
import { SelectorPlugin } from '@uimatch/selector-spi';
import { Page, Locator } from 'playwright';

export const muiPlugin: SelectorPlugin = {
  name: 'material-ui-selector',

  resolve: async (selector: string, page: Page): Promise<Locator> => {
    // Parse: "Button.contained.primary"
    const [component, ...variants] = selector.split('.');

    let locator = page.locator(`[data-mui-component="${component}"]`);

    // Apply variant filters
    for (const variant of variants) {
      locator = locator.filter({ has: page.locator(`[variant="${variant}"]`) });
    }

    return locator;
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
import { SelectorPlugin } from '@uimatch/selector-spi';
import { Page, Locator } from 'playwright';

export const fallbackPlugin: SelectorPlugin = {
  name: 'fallback-selector',

  resolve: async (selector: string, page: Page): Promise<Locator> => {
    // Try strategies in order
    const strategies = [
      () => page.locator(`[data-testid="${selector}"]`),
      () => page.locator(`[aria-label="${selector}"]`),
      () => page.locator(selector), // Fallback to CSS
    ];

    for (const strategy of strategies) {
      const locator = strategy();
      const count = await locator.count();
      if (count > 0) return locator;
    }

    throw new Error(`No element found for selector: ${selector}`);
  },
};

export default fallbackPlugin;
```

## Plugin API Reference

### SelectorPlugin Interface

```typescript
interface SelectorPlugin {
  /**
   * Unique plugin identifier
   */
  name: string;

  /**
   * Resolve a selector string to a Playwright Locator
   *
   * @param selector - The selector string from CLI
   * @param page - Playwright Page instance
   * @returns Locator pointing to the target element
   */
  resolve: (selector: string, page: Page) => Promise<Locator>;

  /**
   * Optional: Validate selector format before resolution
   */
  validate?: (selector: string) => boolean | string;

  /**
   * Optional: Transform selector before resolution
   */
  transform?: (selector: string) => string;
}
```

### Best Practices

#### 1. Error Handling

```typescript
resolve: async (selector, page) => {
  try {
    const locator = page.locator(transformSelector(selector));

    // Validate element exists
    const count = await locator.count();
    if (count === 0) {
      throw new Error(`Element not found: ${selector}`);
    }
    if (count > 1) {
      console.warn(`Multiple elements found for: ${selector}`);
    }

    return locator;
  } catch (error) {
    throw new Error(`Failed to resolve ${selector}: ${error.message}`);
  }
};
```

#### 2. Validation

```typescript
validate: (selector) => {
  // Check format
  if (!selector.match(/^role:.+/)) {
    return `Invalid format. Expected "role:rolename", got "${selector}"`;
  }
  return true;
};
```

#### 3. Async Resolution

```typescript
resolve: async (selector, page) => {
  // Wait for element to appear
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  return locator;
};
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
resolve: async (selector, page) => {
  // Support templates: "button:{id}"
  const template = selector.replace(/{(\w+)}/g, (_, key) => {
    return process.env[`SELECTOR_${key.toUpperCase()}`] || '';
  });

  return page.locator(template);
};
```

### Contextual Selection

```typescript
resolve: async (selector, page) => {
  // Support scoped selectors: "modal>button"
  const [scope, target] = selector.split('>');

  if (target) {
    const scopeLocator = page.locator(scope);
    return scopeLocator.locator(target);
  }

  return page.locator(selector);
};
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
