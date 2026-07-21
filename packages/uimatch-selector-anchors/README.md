# @uimatch/selector-anchors

Selector resolver for uiMatch that uses source locations, AST analysis, snippet
matching, and browser liveness checks to find stable selectors.

## Installation

Install the plugin and its SPI contract:

```shell
npm install @uimatch/selector-anchors @uimatch/selector-spi
```

Requirements:

- Node.js 20.19+ or 22.12+
- ESM
- TypeScript at runtime for TypeScript and JSX analysis

## Use with uiMatch

```shell
npx @uimatch/cli compare \
  figma=AbCdEf123:456-789 \
  story=http://localhost:6006 \
  selector=button-primary \
  selectors=.uimatch/anchors.json \
  selectorsPlugin=@uimatch/selector-anchors
```

The plugin loads the anchors file, derives selector candidates from the
referenced source, checks candidates through the host-provided probe, and
returns the highest-ranked live selector.

## Create an anchor

The package includes the `uimatch-anchors` command:

```shell
npx -p @uimatch/selector-anchors uimatch-anchors \
  --file src/components/Button.tsx \
  --line 10 \
  --column 2 \
  --id button-primary
```

Use `--output` to select a different anchors file and `--force` to replace an
existing anchor. Commit the generated anchors file when selectors are shared by
the project.

## Anchors file

Add the packaged JSON Schema for editor completion and validation:

```json
{
  "$schema": "./node_modules/@uimatch/selector-anchors/schema/anchors.schema.json",
  "version": "1.0.0",
  "anchors": [
    {
      "id": "button-primary",
      "source": {
        "file": "../src/components/Button.tsx",
        "line": 10,
        "col": 2
      },
      "hint": {
        "prefer": ["testid", "role", "text"],
        "testid": "button-primary",
        "role": "button",
        "expectedText": "Submit"
      }
    }
  ]
}
```

Source paths are resolved relative to the anchors file. The uiMatch CLI then
confines them to the selected project root after resolving symlinks. An explicit
`projectRoot=<path>` takes precedence over the nearest Git root and the current
working directory.

The schema is also available from the published package URL:

```text
https://unpkg.com/@uimatch/selector-anchors@latest/schema/anchors.schema.json
```

## Direct use

```typescript
import selectorPlugin, { type Probe } from '@uimatch/selector-anchors';

const probe: Probe = {
  async check(selector) {
    return { selector, isValid: true, checkTime: 0 };
  },
};

const resolution = await selectorPlugin.resolve({
  url: 'http://localhost:3000',
  initialSelector: 'button-primary',
  anchorsPath: './.uimatch/anchors.json',
  projectRoot: process.cwd(),
  probe,
});

console.log(resolution.selector);
console.log(resolution.stabilityScore);
console.log(resolution.reasons);
```

Direct callers may omit `projectRoot` only when unrestricted source paths are
intentional. The host must provide a `Probe` implementation from
`@uimatch/selector-spi`.

## Runtime behavior

- TypeScript analysis is required; HTML parsing is optional unless
  `UIMATCH_HEALTHCHECK_STRICT_HTML=true`.
- `writeBack` updates cached selector fields after a successful resolution.
- Timeout, snippet-matching, and stability-scoring controls are exposed through
  the package API and documented in the generated API reference.

## Documentation

- [Plugin Development](https://kosaki08.github.io/uimatch/docs/plugins)
- [CLI selector options](https://kosaki08.github.io/uimatch/docs/cli-reference#custom-anchor-plugins)
- [API Reference](https://kosaki08.github.io/uimatch/docs/api)
- [JSON Schema](./schema/anchors.schema.json)

## License

MIT
