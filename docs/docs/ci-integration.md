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

```shell
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

```shell
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
- `report.json` - Detailed comparison metrics (includes `metrics.dfs`, `qualityGate`, etc.)

## Quality Gate Enforcement

Fail CI if design fidelity is below threshold:

```yaml
- name: Run comparison with quality gate
  run: |
    npx uimatch compare \
      figma=... story=... selector=... \
      profile=component/strict \
      outDir=uimatch-reports

    # Check quality gate result from report.json
    node - <<'EOF'
    const fs = require('fs');
    const report = JSON.parse(fs.readFileSync('uimatch-reports/report.json', 'utf8'));
    const dfs = report.metrics?.dfs ?? 0;
    const pass = report.qualityGate?.pass ?? false;

    if (!pass) {
      console.error(`❌ Quality gate failed (DFS=${dfs})`);
      console.error(`Reasons: ${report.qualityGate?.reasons?.join(', ')}`);
      process.exit(1);
    }

    console.log(`✅ Quality gate passed (DFS=${dfs})`);
    EOF
```

> **Note:** Even when `areaGapCritical` is exceeded, uiMatch may still set `pass: true` if
> `pixelDiffRatio`, `colorDeltaEAvg`, and `styleCoverage` (if configured) are all within thresholds.
> In that case, `hardGateViolations` will still include an `area_gap` entry and `reasons` will
> contain a message that the area gap was treated as a warning.

**Profiles:**

- `component/strict` - Pixel-perfect (≤1% pixel diff, ΔE≤3.0, 0 high/layout severity issues, 15% area gap critical, 5% area gap warning)
- `component/dev` - Development tolerance (≤8% pixel diff, ΔE≤5.0, 0 high/layout severity issues, 20% area gap critical, 8% area gap warning)
- `page-vs-component` - Loose layout with intersection basis (≤12% pixel diff content, ΔE≤5.0, ≤2 high-severity, 0 layout issues, 25% area gap critical, 12% area gap warning)
- `page/text-doc` - Text-heavy pages (≤20% pixel diff, ΔE≤6.0, ≤3 high-severity, ≤1 layout issue, 35% area gap critical, 15% area gap warning)
- `lenient` - Prototyping (≤15% pixel diff, ΔE≤8.0, ≤5 high-severity, ≤2 layout issues, 30% area gap critical, 15% area gap warning)

**Profile Parameters Explained:**

| Parameter                 | Description                                                                                                | Values                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| **pixelDiffRatio**        | Maximum pixel difference ratio (uses content basis when available)                                         | 0.01-0.15 (1%-15%)        |
| **deltaE**                | Maximum average color delta E (perceptual color difference)                                                | 3.0-8.0                   |
| **maxHighSeverityIssues** | Maximum allowed high-severity style issues                                                                 | 0-5                       |
| **maxLayoutHighIssues**   | Maximum allowed high-severity layout-specific issues                                                       | 0-2                       |
| **areaGapCritical**       | Critical area difference threshold (hard gate, but can be downgraded to warning when other metrics are OK) | 0.15-0.30 (15%-30%)       |
| **areaGapWarning**        | Warning area difference threshold (adds warning to report)                                                 | 0.05-0.15 (5%-15%)        |
| **contentBasis**          | Content rectangle calculation method                                                                       | `union` or `intersection` |
| **autoReEvaluate**        | Enable automatic re-evaluation with intersection basis for pad mode                                        | `true` or `false`         |

See [quality-gate-profiles.ts](https://github.com/kosaki08/uimatch/blob/main/packages/uimatch-core/src/config/quality-gate-profiles.ts) for complete threshold definitions.

## Advanced: Multi-Project Matrix

Compare multiple components in parallel:

````yaml
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

## Recipe: Text Verification Workflow

For text-heavy pages like Terms of Service where strict pixel matching might differ due to rendering quirks, you can focus on text content verification using the `page/text-doc` profile.

Here is a comprehensive workflow example that:

1.  Starts a local preview server
2.  Waits for it to be ready
3.  Runs uiMatch with text-verification parameters (`textMatch=ratio`, `textMinRatio=1.0`)

<details>
<summary>View Workflow YAML</summary>

```yaml
name: Terms of Service Text Verification

on:
  pull_request:
    paths:
      - 'src/pages/TermsPage.tsx'
      - 'src/components/terms/**'
      - '.github/workflows/terms-text-verification.yml'

jobs:
  verify-terms-text:
    name: Verify Terms Text Matches Figma
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Build application
        run: pnpm build

      - name: Start preview server
        run: |
          pnpm preview &
          echo "PREVIEW_PID=$!" >> $GITHUB_ENV
          # Wait for server to be ready
          npx wait-on http://localhost:4173 --timeout 30000

      - name: Run uiMatch text verification
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
          FIGMA_TERMS_NODE: ${{ secrets.FIGMA_TERMS_NODE }}
          UIMATCH_HEADLESS: true
        run: |
          npx @uimatch/cli compare \
            figma=$FIGMA_TERMS_NODE \
            story=http://localhost:4173/terms \
            selector="#terms-root" \
            text=true \
            textMode=self \
            textMatch=ratio \
            textMinRatio=1.0 \
            textGate=true \
            profile=page/text-doc \
            size=pad \
            contentBasis=intersection \
            areaGapCritical=1.0 \
            outDir=./uimatch-reports/terms-text-check

      - name: Upload uiMatch reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: uimatch-reports
          path: uimatch-reports/
          retention-days: 30

      - name: Stop preview server
        if: always()
        run: |
          if [ ! -z "$PREVIEW_PID" ]; then
            kill $PREVIEW_PID || true
          fi
````

</details>
```

## See Also

- [Getting Started](./getting-started.md) - Installation and basic usage
- [CLI Reference](./cli-reference.md) - Complete command options
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
