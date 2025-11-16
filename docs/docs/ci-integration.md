# CI Integration

uiMatch can be seamlessly integrated into GitHub Actions and other CI environments to automate design-to-implementation comparison as part of your pull request workflow.

## Quick Setup

### Minimal GitHub Actions Example

```yaml
name: uiMatch QA
on: [pull_request]

jobs:
  compare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: |
          npm install -g @uimatch/cli playwright
          npx playwright install --with-deps chromium

      - name: Run comparison
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          UIMATCH_HEADLESS: true
        run: |
          npx uimatch compare \
            figma=${{ secrets.FIGMA_FILE }}:${{ secrets.FIGMA_NODE }} \
            story=https://your-storybook.com/?path=/story/button \
            selector="#root button" \
            outDir=uimatch-reports

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: uimatch-reports
          path: uimatch-reports/
```

## Playwright Installation and Caching

### Install Chromium with System Dependencies

CI environments require the `--with-deps` flag to install system dependencies for Chromium:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium
```

### Optimize with Caching

Cache Playwright browsers to reduce CI time:

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-playwright-

- name: Install Playwright (if not cached)
  run: npx playwright install --with-deps chromium
```

## Environment Variables and Secrets

### Required Secrets

Configure these secrets in your GitHub repository settings:

| Secret        | Description                 | Example        |
| ------------- | --------------------------- | -------------- |
| `FIGMA_TOKEN` | Figma personal access token | `figd_...`     |
| `FIGMA_FILE`  | Figma file key              | `AbCdEf123456` |
| `FIGMA_NODE`  | Figma node ID               | `1-23`         |

### Environment Variables

| Variable             | Purpose                              | Default | CI Recommended |
| -------------------- | ------------------------------------ | ------- | -------------- |
| `FIGMA_ACCESS_TOKEN` | Figma API authentication             | -       | ✅ Required    |
| `UIMATCH_HEADLESS`   | Run browser in headless mode         | `true`  | `true`         |
| `UIMATCH_LOG_LEVEL`  | Logging verbosity                    | `info`  | `info`         |
| `BASIC_AUTH_USER`    | Basic auth for Storybook (if needed) | -       | Optional       |
| `BASIC_AUTH_PASS`    | Basic auth for Storybook (if needed) | -       | Optional       |

## Bypass Mode (Rate Limit Avoidance)

For CI environments where API rate limits are a concern, use **bypass mode** with pre-extracted Figma images:

### Setup

1. Extract Figma design as base64-encoded PNG locally:

```bash
# Option 1: Use browser DevTools
# 1. Open Figma file in browser
# 2. Right-click node → Inspect → Network tab
# 3. Export as PNG → Copy image as base64
# 4. Store in environment variable

# Option 2: Use Figma REST API directly
curl -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/<fileKey>?ids=<nodeId>&format=png&scale=2" \
  | jq -r '.images[]' \
  | xargs curl -s \
  | base64 > figma-image.b64
```

2. Store as repository secret: `UIMATCH_FIGMA_PNG_B64`

3. Use in CI with `figma=bypass:test`:

```yaml
- name: Run comparison (bypass mode)
  env:
    UIMATCH_FIGMA_PNG_B64: ${{ secrets.UIMATCH_FIGMA_PNG_B64 }}
    UIMATCH_HEADLESS: true
  run: |
    npx uimatch compare \
      figma=bypass:test \
      story=https://your-storybook.com/?path=/story/button \
      selector="#root button" \
      outDir=uimatch-reports
```

**Benefits:**

- Avoids Figma API rate limits
- Faster execution (no API call)
- Consistent baseline image

**When to use:**

- High-frequency CI runs
- API rate limit constraints
- Stable design baselines

## Common CI Pitfalls

### Font Differences

Headless browsers may render fonts differently than local environments. Solutions:

1. **Install system fonts in CI:**

```yaml
- name: Install fonts
  run: |
    sudo apt-get update
    sudo apt-get install -y fonts-noto-color-emoji fonts-noto-cjk
```

2. **Use web fonts consistently:**
   - Ensure Storybook loads the same fonts as Figma
   - Use `@font-face` with stable CDN URLs

### Viewport Mismatches

Ensure CI viewport matches local testing:

```bash
# Explicitly set viewport in comparison command
npx uimatch compare \
  figma=... story=... selector=... \
  viewport=1280x720
```

### Browser Not Installed

Error: `Playwright: Chromium not installed`

**Solution:**

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
```

### Storybook URL Issues

**Wrong:** `https://storybook.com/?path=/story/button` (Canvas URL)
**Correct:** `https://storybook.com/iframe.html?id=button` (Iframe URL)

Use `iframe.html?id=...` for direct component rendering without UI chrome.

## Suite Mode for Batch Comparisons

Run multiple comparisons in a single CI job:

```yaml
- name: Run comparison suite
  env:
    FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_TOKEN }}
  run: |
    npx uimatch suite path=.github/uimatch-suite.json
```

**Suite configuration** (`.github/uimatch-suite.json`):

```json
{
  "name": "Component Suite",
  "items": [
    {
      "name": "Button Component",
      "figma": "fileKey:node1",
      "story": "https://storybook.com/iframe.html?id=button",
      "selector": "#root button"
    },
    {
      "name": "Card Component",
      "figma": "fileKey:node2",
      "story": "https://storybook.com/iframe.html?id=card",
      "selector": "#root .card"
    }
  ]
}
```

## Artifacts and Reporting

Upload comparison results as CI artifacts for review:

```yaml
- name: Upload reports
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: uimatch-reports
    path: uimatch-reports/
    retention-days: 30
```

**Artifact contents:**

- `figma.png` - Figma design screenshot
- `impl.png` - Implementation screenshot
- `diff.png` - Visual diff with highlighted discrepancies
- `result.json` - Detailed comparison metrics

## Quality Gate Enforcement

Fail CI if design fidelity is below threshold:

```yaml
- name: Run comparison with quality gate
  run: |
    npx uimatch compare \
      figma=... story=... selector=... \
      profile=component/strict \
      outDir=uimatch-reports

    # Parse DFS score and fail if below threshold
    DFS=$(grep -oP 'DFS: \K[\d.]+' uimatch-reports/result.json || echo "0")
    if (( $(echo "$DFS < 80.0" | bc -l) )); then
      echo "❌ Design Fidelity Score ($DFS) below threshold (80.0)"
      exit 1
    fi
```

**Profiles:**

- `component/strict` - Pixel-perfect (≤1% pixel diff, ΔE≤3.0, 0 high-severity issues)
- `component/dev` - Development tolerance (≤8% pixel diff, ΔE≤5.0, 0 high-severity issues)
- `page-vs-component` - Loose layout (≤12% pixel diff, ΔE≤5.0, ≤2 high-severity issues)
- `lenient` - Prototyping (≤15% pixel diff, ΔE≤8.0, ≤5 high-severity issues)

See [quality-gate-profiles.ts](https://github.com/kosaki08/uimatch/blob/main/packages/uimatch-core/src/config/quality-gate-profiles.ts) for complete threshold definitions.

## Advanced: Multi-Project Matrix

Compare multiple components in parallel:

```yaml
jobs:
  compare:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        component: [button, card, modal, navbar]
    steps:
      - uses: actions/checkout@v4
      # ... setup steps ...

      - name: Run comparison for ${{ matrix.component }}
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_TOKEN }}
        run: |
          npx uimatch compare \
            figma=${{ secrets[format('FIGMA_FILE_{0}', matrix.component)] }} \
            story=https://storybook.com/iframe.html?id=${{ matrix.component }} \
            selector="#root .${{ matrix.component }}" \
            outDir=uimatch-reports-${{ matrix.component }}
```

## See Also

- [Getting Started](./getting-started.md) - Installation and basic usage
- [CLI Reference](./cli-reference.md) - Complete command options
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
