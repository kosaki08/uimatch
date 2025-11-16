# Local Testing

This guide explains how to test uiMatch packages locally before publishing to npm. Two methods are available: **Pack** (recommended for pre-publish verification) and **Link** (for rapid development iteration).

## Method 1: Pack (Recommended)

The pack method simulates actual npm distribution and catches dependency issues that might not appear during development.

### Why Pack?

- **Accurate simulation**: Mimics real npm package installation
- **Dependency validation**: Catches missing runtime dependencies
- **Module resolution testing**: Verifies ESM/CJS compatibility
- **Pre-publish verification**: Ensures packages work as distributed

### Steps

#### 1. Build All Packages

```shell
pnpm build
```

#### 2. Create Tarballs

pnpm automatically resolves `workspace:*` dependencies to actual versions during pack:

```shell
mkdir -p dist-packages
pnpm -C packages/shared-logging pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-selector-spi pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-core pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-scoring pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-selector-anchors pack --pack-destination ../../dist-packages
pnpm -C packages/uimatch-cli pack --pack-destination ../../dist-packages
```

**Result:** Tarballs are created in `dist-packages/`:

- `uimatch-shared-logging-0.1.0.tgz`
- `uimatch-selector-spi-0.1.0.tgz`
- `uimatch-core-0.1.0.tgz`
- `uimatch-scoring-0.1.0.tgz`
- `uimatch-selector-anchors-0.1.0.tgz`
- `uimatch-cli-0.1.0.tgz`

#### 3. Test in Isolated Environment

```shell
# Create clean test environment
mkdir -p /tmp/uimatch-test && cd /tmp/uimatch-test
npm init -y

# Install from tarballs
npm install \
  /path/to/uimatch/dist-packages/uimatch-shared-logging-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-spi-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-core-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-scoring-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-anchors-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-cli-*.tgz \
  playwright

# Install browser
npx playwright install chromium
```

#### 4. Verify with Smoke Test

```shell
# Set bypass mode environment variable (10x10 red square PNG)
export UIMATCH_FIGMA_PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"

# Run smoke test
npx uimatch compare \
  figma=bypass:test \
  story="data:text/html,<div id='t' style='width:10px;height:10px;background:red'></div>" \
  selector="#t" \
  dpr=1 \
  size=pad
```

**Expected output:**

```
✅ DFS: XX.XX
```

### What to Verify

- ✅ CLI executable runs without errors
- ✅ All dependencies resolve correctly
- ✅ ESM module imports work
- ✅ Playwright integration functions
- ✅ Comparison engine produces expected output
- ✅ No runtime dependency errors

### Common Issues Detected

| Issue                      | Symptom                              | Fix                                               |
| -------------------------- | ------------------------------------ | ------------------------------------------------- |
| Missing runtime dependency | `Cannot find module '@uimatch/core'` | Move dep from `devDependencies` to `dependencies` |
| ESM resolution failure     | `ERR_MODULE_NOT_FOUND`               | Check `package.json` `type: "module"` and exports |
| CLI not executable         | `command not found: uimatch`         | Verify `bin` field in `package.json`              |
| Peer dependency missing    | Playwright errors                    | Document peer deps in README                      |

## Method 2: Link (Rapid Iteration)

The link method is faster for development but doesn't catch distribution issues.

### When to Use Link

- **Rapid prototyping**: Quick iteration during feature development
- **Local debugging**: Testing changes without full build cycle
- **Cross-package development**: Working on multiple packages simultaneously

**⚠️ Limitations:**

- Doesn't catch dependency packaging issues
- Links persist across restarts but break if paths move
- Requires manual unlinking cleanup

### Steps

#### 1. Build Packages

```shell
pnpm build
```

#### 2. Register Packages Globally

```shell
cd packages/shared-logging && pnpm link --global && cd ../..
cd packages/uimatch-selector-spi && pnpm link --global && cd ../..
cd packages/uimatch-core && pnpm link --global && cd ../..
cd packages/uimatch-scoring && pnpm link --global && cd ../..
cd packages/uimatch-selector-anchors && pnpm link --global && cd ../..
cd packages/uimatch-cli && pnpm link --global && cd ../..
```

#### 3. Link in Consumer Project

```shell
cd /path/to/consumer
pnpm link --global @uimatch/shared-logging
pnpm link --global @uimatch/selector-spi
pnpm link --global @uimatch/core
pnpm link --global @uimatch/scoring
pnpm link --global @uimatch/selector-anchors
pnpm link --global @uimatch/cli
```

#### 4. Test Changes

```shell
# Make changes in source packages
cd /path/to/uimatch/packages/uimatch-core
# ... edit files ...
pnpm build

# Changes immediately reflected in linked consumer project
cd /path/to/consumer
npx uimatch compare ...
```

#### 5. Unlink When Done

```shell
# In consumer project
cd /path/to/consumer
pnpm unlink --global @uimatch/cli

# In source repository
cd /path/to/uimatch/packages/uimatch-cli
pnpm unlink --global
```

**Repeat for all linked packages.**

### Link Troubleshooting

| Issue                                   | Solution                                       |
| --------------------------------------- | ---------------------------------------------- |
| Changes not reflected                   | Rebuild package: `pnpm build`                  |
| Link broken after path change           | Re-run `pnpm link --global` from new location  |
| `node_modules` regeneration breaks link | Re-link in consumer project                    |
| Multiple Node versions conflict         | Ensure same Node version for link and consumer |

## Pre-Publish Checklist

Before publishing to npm, verify distribution integrity with the **Pack method**:

```shell
# Full verification workflow
pnpm build
# ... run full pack verification from Method 1

# Or quick smoke test
pnpm -C packages/uimatch-cli pack --pack-destination ../../
npm i -g ./uimatch-cli-*.tgz
npx uimatch compare figma=bypass:test story="..." selector="..."
```

### Critical Checks

- ✅ **Runtime dependencies**: All runtime deps in `dependencies` (not `devDependencies`)
- ✅ **Module resolution**: ESM/CJS imports work with Node.js directly
- ✅ **CLI executable**: Correct shebang `#!/usr/bin/env node`
- ✅ **No secrets**: Run `npm pack --dry-run` to review package contents
- ✅ **Workspace resolution**: Publish from root, not subdirectories
- ✅ **Peer dependencies**: Playwright documented in README

### Example Verification Script

```shell
#!/bin/bash
# verify-distribution.sh

set -e

echo "🔨 Building packages..."
pnpm build

echo "📦 Creating tarballs..."
mkdir -p dist-packages
for pkg in shared-logging uimatch-selector-spi uimatch-core uimatch-scoring uimatch-selector-anchors uimatch-cli; do
  pnpm -C packages/$pkg pack --pack-destination ../../dist-packages
done

echo "🧪 Testing in isolated environment..."
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
npm init -y

npm install \
  /path/to/uimatch/dist-packages/uimatch-shared-logging-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-spi-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-core-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-scoring-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-selector-anchors-*.tgz \
  /path/to/uimatch/dist-packages/uimatch-cli-*.tgz \
  playwright

npx playwright install chromium

export UIMATCH_FIGMA_PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"

npx uimatch compare \
  figma=bypass:test \
  story="data:text/html,<div id='t' style='width:10px;height:10px;background:red'></div>" \
  selector="#t" \
  dpr=1 \
  size=pad

echo "✅ Distribution verification complete!"
```

## When to Use Each Method

| Scenario                   | Method   | Why                             |
| -------------------------- | -------- | ------------------------------- |
| Pre-publish verification   | **Pack** | Catches distribution issues     |
| Final QA before release    | **Pack** | Simulates real npm installation |
| Dependency troubleshooting | **Pack** | Verifies runtime dependencies   |
| Rapid feature development  | **Link** | Faster iteration cycle          |
| Multi-package debugging    | **Link** | Immediate change reflection     |
| Cross-package refactoring  | **Link** | No rebuild overhead             |

**Recommendation:** Use **Link** during development, switch to **Pack** before publishing or when encountering mysterious runtime issues.

## See Also

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Development Setup](../README.md#development) - Contributor guide
- [Publishing to npm](../README.md#publishing-to-npm) - Release workflow
