---
sidebar_position: 4
---

# Troubleshooting

Common issues and solutions when using UI Match.

## Quick Diagnostics

Run the built-in health check:

```bash
npx uimatch doctor
```

This checks:

- ✅ Figma API connectivity
- ✅ Browser automation setup
- ✅ Environment variables
- ✅ Plugin compatibility

## Common Issues

### Figma Access Errors

**Error:** `Failed to fetch Figma file: 403 Forbidden`

**Solutions:**

1. **Check your token:**

   ```bash
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

   ```bash
   npx uimatch compare ... --headless false
   ```

   Watch the browser to see what's happening.

2. **Wait for element to load:**

   ```bash
   --waitFor "#my-component"
   --timeout 5000
   ```

3. **Check selector specificity:**

   ```bash
   # Try more specific selector
   selector="main #my-component"

   # Or use data-testid
   selector="[data-testid='my-component']"
   ```

4. **Verify URL is correct:**
   ```bash
   # Check the page actually loads
   curl -I http://localhost:3000/your-page
   ```

### Size Mismatch Issues

**Error:** `Comparison failed: size mismatch (expected 800x600, got 1024x768)`

**Solutions:**

1. **Use flexible size matching:**

   ```bash
   --size contain    # Default, usually works
   --size figma      # Force Figma dimensions
   --size story      # Force implementation dimensions
   ```

2. **Check viewport settings:**

   ```bash
   --viewport 1920x1080   # Match your design specs
   ```

3. **Account for responsive design:**
   ```bash
   --contentBasis intrinsic   # Let content determine size
   ```

### Low Similarity Scores

**Error:** `Similarity 0.82 below threshold 0.95`

**Solutions:**

1. **Generate diff image to investigate:**

   ```bash
   # Check uimatch-output/diff-*.png
   # Red areas show differences
   ```

2. **Common causes:**
   - **Fonts** - Web fonts may render differently
   - **Anti-aliasing** - Browser rendering variations
   - **Images** - Check image loading and quality
   - **Colors** - Verify CSS color values match Figma

3. **Adjust threshold if differences are acceptable:**

   ```bash
   # Loosen for minor rendering differences
   --threshold 0.90
   ```

4. **Fix the implementation:**
   - Update CSS to match Figma
   - Ensure fonts are loaded
   - Check responsive breakpoints

### Browser Automation Failures

**Error:** `Browser failed to launch` or `Page navigation timeout`

**Solutions:**

1. **Check browser installation:**

   ```bash
   npx playwright install chromium
   ```

2. **Increase timeout:**

   ```bash
   --timeout 10000    # 10 seconds
   ```

3. **Check for port conflicts:**

   ```bash
   # Ensure your dev server is actually running
   lsof -i :3000
   ```

4. **Disable headless for debugging:**
   ```bash
   --headless false
   ```

### Environment Variable Issues

**Error:** `FIGMA_ACCESS_TOKEN is not set`

**Solutions:**

1. **Create `.env` file:**

   ```bash
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

```bash
FIGMA_ACCESS_TOKEN=figd_xxx    # Get from Figma settings
```

Optional:

```bash
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

   ```bash
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

   ```bash
   npx uimatch suite tests.json --parallel 4
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
   // Must export SelectorPlugin interface
   export const myPlugin: SelectorPlugin = { ... };
   ```

2. **Verify plugin path:**

   ```bash
   # Use absolute or relative path
   --anchor ./src/plugins/my-anchor.js
   --anchor @my-company/anchor-plugin
   ```

3. **Check async/await:**
   ```typescript
   resolve: async (selector, page) => {
     // Must return Promise<Locator>
     return page.locator(selector);
   };
   ```

## Getting Help

Still stuck? Here's how to get help:

1. **Enable debug logging:**

   ```bash
   UIMATCH_LOG_LEVEL=debug npx uimatch compare ...
   ```

2. **Check GitHub Issues:**
   - Search existing issues
   - Provide minimal reproduction example

3. **Include in bug reports:**
   - OS and Node.js version
   - UI Match version
   - Complete error message
   - Debug logs
   - Minimal reproduction case

## Performance Tips

### Speed Up Comparisons

1. **Use headless mode in CI:**

   ```bash
   --headless true
   ```

2. **Reduce screenshot area:**

   ```bash
   # Target specific elements, not full page
   selector="#specific-component"
   ```

3. **Parallel execution:**
   ```bash
   npx uimatch suite tests.json --parallel 4
   ```

### Reduce Flakiness

1. **Wait for animations:**

   ```bash
   --waitFor "#component.ready"
   ```

2. **Disable animations in test:**

   ```css
   /* In your test environment CSS */
   * {
     animation-duration: 0s !important;
     transition-duration: 0s !important;
   }
   ```

3. **Use stable thresholds:**
   ```bash
   # 0.95 is usually stable across environments
   --threshold 0.95
   ```

## See Also

- [CLI Reference](./cli-reference.md) - All command options
- [Concepts](./concepts.md) - Understanding anchors and quality gates
- [Plugins](./plugins.md) - Creating custom plugins
