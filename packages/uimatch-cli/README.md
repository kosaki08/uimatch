# @uimatch/cli

Command-line and programmatic entry point for comparing Figma designs with
implemented interfaces.

## Installation

Install the CLI with Playwright, then install Chromium:

```shell
npm install -D @uimatch/cli playwright
npx playwright install chromium
```

Set `FIGMA_ACCESS_TOKEN` when using the Figma API:

```shell
export FIGMA_ACCESS_TOKEN="figd_..."
```

## Quick start

```shell
npx @uimatch/cli compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button" \
  profile=component/strict \
  outDir=./comparison-results
```

## Commands

| Command     | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `compare`   | Compare one Figma node with one implementation       |
| `suite`     | Run comparisons defined in a JSON suite              |
| `text-diff` | Compare two strings after uiMatch text normalization |
| `doctor`    | Diagnose the runtime, browser, and anchors setup     |
| `settings`  | Inspect or reset the effective project configuration |
| `version`   | Print the CLI version                                |

The [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference)
defines command arguments, configuration keys, environment variables, output,
and exit codes.

## Programmatic use

```typescript
import { uiMatchCompare } from '@uimatch/cli';

const result = await uiMatchCompare({
  figma: 'AbCdEf123:456-789',
  story: 'http://localhost:6006',
  selector: '#button',
  profile: 'component/strict',
});

console.log(result.report.metrics.dfs);
console.log(result.summary);
```

Programmatic callers receive a result object and remain responsible for their
own process exit behavior.

## Selector plugins

Set `selectorsPlugin` and, when required, `selectors` to use a selector resolver:

```shell
npx @uimatch/cli compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006 \
  selector=button-primary \
  selectors=.uimatch/anchors.json \
  selectorsPlugin=@uimatch/selector-anchors
```

Plugins execute as trusted code in the uiMatch process. See
[Plugin Development](https://kosaki08.github.io/uimatch/docs/plugins) for the
runtime contract and failure model.

## Documentation

- [Getting Started](https://kosaki08.github.io/uimatch/docs/getting-started)
- [CLI Reference](https://kosaki08.github.io/uimatch/docs/cli-reference)
- [Concepts](https://kosaki08.github.io/uimatch/docs/concepts)
- [CI Integration](https://kosaki08.github.io/uimatch/docs/ci-integration)
- [Troubleshooting](https://kosaki08.github.io/uimatch/docs/troubleshooting)
- [API Reference](https://kosaki08.github.io/uimatch/docs/api)

## License

MIT
