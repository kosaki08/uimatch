# Local Testing

Use repository scripts as the source of truth for local verification. They keep
the package build order, integration configuration, and public package list in
one place.

## Standard verification

Run the same high-level checks used during development:

```shell
pnpm run check
pnpm test
```

`pnpm test` runs the Vitest unit suite, rebuilds the packages, runs the
integration suite against the built CLI, and finishes with the Playwright Test
liveness suite. Use `pnpm run test:unit` for a faster loop when the test does not
depend on `dist`.

Browser integration tests require the Playwright Chromium build:

```shell
pnpm exec playwright install chromium
pnpm run test:integration
pnpm run test:e2e
```

Integration tests use Vitest as the runner and Playwright for browser
automation. `test:e2e` is the separate Playwright Test suite.

## Test public tarballs

Build and pack every public package with the repository helper:

```shell
pnpm run build
pnpm run pack:local
```

Tarballs are written to `dist-packages/`. The helper reads each package's
`private` flag and currently packs:

- `@uimatch/cli`
- `@uimatch/selector-anchors`
- `@uimatch/selector-spi`
- `@uimatch/shared-logging`

`@uimatch/core` and `@uimatch/scoring` are private implementation packages and
must not appear in the output.

The integration suite includes an isolated consumer smoke test that packs these
packages into a temporary directory, installs them, type-checks a consumer,
imports every public module with Node.js, and invokes the packaged CLI:

```shell
pnpm run test:integration
```

The test implementation is
[`e2e/lib-import-smoke.e2e.test.ts`](https://github.com/kosaki08/uimatch/blob/main/e2e/lib-import-smoke.e2e.test.ts).

## Manual distribution inspection

For a release investigation, inspect a tarball without installing it:

```shell
tar -tzf dist-packages/uimatch-cli-*.tgz
tar -xzf dist-packages/uimatch-cli-*.tgz -O package/package.json
```

Verify that:

- package exports point to files present in the archive;
- no `workspace:` dependency ranges remain;
- the CLI bundle and declarations are included;
- private packages were not packed;
- no credentials or local artifacts are present.

Avoid global workspace links for release verification. They bypass tarball
contents and dependency rewriting, which are the behavior this check is meant
to validate.

## See also

- [Getting Started](./getting-started.md)
- [CLI Reference](./cli-reference.md)
- [CI Integration](./ci-integration.md)
