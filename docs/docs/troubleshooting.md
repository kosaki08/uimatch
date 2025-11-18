---
sidebar_position: 4
---

# Troubleshooting

Common issues and solutions when using uiMatch.

## Quick Diagnostics

Run the built-in health check:

```shell
npx uimatch doctor
```

This checks:

- ✅ Figma API connectivity
- ✅ Browser automation setup
- ✅ Environment variables
- ✅ Plugin compatibility

## Common Issues

### `sh: uimatch: command not found` / `'uimatch@*' is not in this registry`

**Error:** When running `npx uimatch compare ...`, you get:

- `sh: uimatch: command not found`
- `npm error 404 Not Found - GET https://registry.npmjs.org/uimatch - Not found`
- `npm error 404  'uimatch@*' is not in this registry`

This usually happens when:

- `@uimatch/cli` is **not installed** yet, and
- you run `npx uimatch ...` (npx tries to install a package literally named `uimatch`, which doesn't exist)

**Solutions:**

1. **Install the CLI first:**

   ```shell
   # As dev dependency
   npm install -D @uimatch/cli

   # Or globally
   npm install -g @uimatch/cli
   ```

   Then run:

   ```shell
   npx uimatch compare ...
   # or
   uimatch compare ...
   ```

2. **Or use an explicit npx one-liner (no install required):**

   ```shell
   npx -p @uimatch/cli uimatch compare \
     figma=<fileKey>:<nodeId> \
     story=http://localhost:3000 \
     selector="#my-component"
   ```

   The `-p @uimatch/cli` flag explicitly tells npx which package to install, and `uimatch` is the binary name to run.

**Why this happens:**

- Package name: `@uimatch/cli`
- Binary name: `uimatch`

When you run `npx uimatch`, npx looks for a package named `uimatch` (not `@uimatch/cli`), which doesn't exist. Using `-p @uimatch/cli uimatch` clarifies both the package and binary names.

### Figma Access Errors

**Error:** `Failed to fetch Figma file: 403 Forbidden`

**Solutions:**

1. **Check your token:**

   ```shell
   # Verify token is set
   echo $FIGMA_ACCESS_TOKEN
   ```

2. **Regenerate token:**
   - Go to [Figma Settings > Personal Access Tokens](https://www.figma.com/developers/api#access-tokens)
   - Generate new token
   - Update `.env` file

3. **Verify file access:**
   - Ensure your account has access to the Figma file
   - Check if file is in a team you're not part of

### Selector Not Found

**Error:** `Selector "#my-component" did not match any elements`

**Solutions:**

1. **Run with visible browser:**

   ```shell
   UIMATCH_HEADLESS=false npx uimatch compare ...
   ```

   Watch the browser to see what's happening.

2. **Check selector specificity:**

   ```shell
   # Try more specific selector
   selector="main #my-component"

   # Or use data-testid
   selector="[data-testid='my-component']"
   ```

3. **Verify URL is correct:**
   ```shell
   # Check the page actually loads
   curl -I http://localhost:3000/your-page
   ```

### Size Mismatch Issues

**Error:** `Comparison failed: size mismatch (expected 800x600, got 1024x768)`

**Solutions:**

1. **Use flexible size matching:**

   ```shell
   size=pad          # Pad smaller image with letterboxing (useful for page-vs-component)
   size=strict       # Sizes must match exactly (default)
   size=crop         # Compare common area only
   size=scale        # Scale implementation to Figma size
   ```

2. **Check viewport settings:**

   ```shell
   viewport=1920x1080   # Match your design specs
   ```

### Low Quality Gate Scores

**Error:** `Quality gate failed: pixelDiffRatio 0.12 exceeds threshold 0.08`

**Solutions:**

1. **Generate diff image to investigate:**

   ```shell
   # Specify output directory to save diff images
   outDir=./comparison-results
   # Check comparison-results/diff.png - red areas show differences
   ```

2. **Common causes:**
   - **Fonts** - Web fonts may render differently
   - **Anti-aliasing** - Browser rendering variations
   - **Images** - Check image loading and quality
   - **Colors** - Verify CSS color values match Figma

3. **Use more relaxed profile if differences are acceptable:**

   ```shell
   # For development iteration
   profile=component/dev    # pixelDiffRatio: 0.08, deltaE: 5.0

   # For lenient comparison
   profile=lenient          # pixelDiffRatio: 0.15, deltaE: 8.0
   ```

4. **Fix the implementation:**
   - Update CSS to match Figma
   - Ensure fonts are loaded
   - Check responsive breakpoints

### Browser Automation Failures

**Error:** `Browser failed to launch` or `Page navigation timeout`

**Solutions:**

1. **Check browser installation:**

   ```shell
   npx playwright install chromium
   ```

2. **Check for port conflicts:**

   ```shell
   # Ensure your dev server is actually running
   lsof -i :3000
   ```

3. **Disable headless for debugging:**
   ```shell
   UIMATCH_HEADLESS=false npx uimatch compare ...
   ```

### Environment Variable Issues

**Error:** `FIGMA_ACCESS_TOKEN is not set`

**Solutions:**

1. **Create `.env` file:**

   ```shell
   echo "FIGMA_ACCESS_TOKEN=your_token_here" > .env
   ```

2. **Load .env in your script:**

   ```javascript
   // In Node.js projects
   require('dotenv').config();
   ```

3. **Set in CI/CD:**
   ```yaml
   # GitHub Actions example
   env:
     FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
   ```

## Environment Variables Cheat Sheet

Required:

```shell
FIGMA_ACCESS_TOKEN=figd_xxx    # Get from Figma settings
```

Optional:

```shell
UIMATCH_LOG_LEVEL=debug        # silent | info | debug
UIMATCH_HEADLESS=false         # Show browser during tests
UIMATCH_ENABLE_BROWSER_TESTS=true   # Enable E2E tests
```

## CI/CD Issues

### Tests Pass Locally, Fail in CI

**Common causes:**

1. **Font rendering differences:**

   ```yaml
   # Install fonts in CI
   - name: Install fonts
     run: apt-get install -y fonts-liberation
   ```

2. **Screen resolution:**

   ```shell
   # Set consistent viewport
   --viewport 1920x1080
   ```

3. **Missing browser:**

   ```yaml
   # GitHub Actions
   - name: Install browsers
     run: npx playwright install --with-deps chromium
   ```

4. **Environment variables:**
   ```yaml
   # Verify secrets are set
   env:
     FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
   ```

### Slow CI Performance

**Optimizations:**

1. **Run comparisons in parallel:**

   ```shell
   npx uimatch suite path=tests.json concurrency=4
   ```

2. **Cache browser binaries:**

   ```yaml
   # GitHub Actions
   - uses: actions/cache@v3
     with:
       path: ~/.cache/ms-playwright
       key: ${{ runner.os }}-playwright
   ```

3. **Reduce comparison count:**
   - Focus on critical paths
   - Use suites to organize and skip non-critical tests

## Plugin Issues

### Custom Anchor Not Working

**Error:** `Plugin failed to resolve selector`

**Solutions:**

1. **Check plugin export:**

   ```typescript
   // Must export SelectorResolverPlugin interface
   import type { SelectorResolverPlugin } from '@uimatch/selector-spi';

   export const myPlugin: SelectorResolverPlugin = {
     name: 'my-plugin',
     version: '1.0.0',
     async resolve(context) {
       /* ... */
     },
   };

   export default myPlugin;
   ```

2. **Verify plugin path:**

   ```shell
   # Use absolute or relative path
   --anchor ./src/plugins/my-anchor.js
   --anchor @my-company/anchor-plugin
   ```

3. **Check async/await:**
   ```typescript
   async resolve(context) {
     // Must return Promise<Resolution>
     const { initialSelector, probe } = context;
     const result = await probe.check(initialSelector);
     return {
       selector: initialSelector,
       stabilityScore: result.isValid ? 80 : 0,
       reasons: [result.isValid ? 'Found' : 'Not found'],
     };
   }
   ```

## Getting Help

Still stuck? Here's how to get help:

1. **Enable debug logging:**

   ```shell
   UIMATCH_LOG_LEVEL=debug npx uimatch compare ...
   ```

2. **Check GitHub Issues:**
   - Search existing issues
   - Provide minimal reproduction example

3. **Include in bug reports:**
   - OS and Node.js version
   - uiMatch version
   - Complete error message
   - Debug logs
   - Minimal reproduction case

## Performance Tips

### Speed Up Comparisons

1. **Use headless mode in CI:**

   ```shell
   # Headless is true by default
   # Explicitly set if needed:
   UIMATCH_HEADLESS=true npx uimatch compare ...
   ```

2. **Reduce screenshot area:**

   ```shell
   # Target specific elements, not full page
   selector="#specific-component"
   ```

3. **Parallel execution:**
   ```shell
   npx uimatch suite path=tests.json concurrency=4
   ```

### Reduce Flakiness

1. **Disable animations in test:**

   ```css
   /* In your test environment CSS */
   * {
     animation-duration: 0s !important;
     transition-duration: 0s !important;
   }
   ```

2. **Use appropriate quality profiles:**

   ```shell
   # Strict for pixel-perfect comparison
   profile=component/strict

   # Development for stable CI environments
   profile=component/dev
   ```

## See Also

- [CLI Reference](./cli-reference.md) - All command options
- [Concepts](./concepts.md) - Understanding anchors and quality gates
- [Plugins](./plugins.md) - Creating custom plugins
