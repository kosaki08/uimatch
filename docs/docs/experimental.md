---
sidebar_position: 6
---

# AI and MCP Integration

:::warning Experimental API
The TypeScript APIs on this page may change while uiMatch is in the 0.x release
series. The standard `compare` command and its exit codes remain the supported
CLI path.
:::

## LLM-formatted comparison output

Use the normal `compare` command with `format=claude`:

```shell
npx @uimatch/cli compare \
  figma=current \
  story=http://localhost:3000 \
  selector="#app" \
  format=claude
```

When `outDir` is set, uiMatch also writes `claude.json` and
`claude-prompt.txt` beside the standard artifacts.

```shell
npx @uimatch/cli compare \
  figma=FILE_KEY:NODE_ID \
  story=http://localhost:3000 \
  selector="#app" \
  format=claude \
  outDir=./uimatch-results
```

The comparison uses the same quality-gate decision and exit code in standard
and Claude formats.

## Experimental TypeScript API

### LLM formatting

```typescript
import { experimental, type CompareResult } from '@uimatch/cli';

function formatResult(result: CompareResult): string {
  const payload = experimental.formatForLLM(result, { preferTokens: true });
  return experimental.generateLLMPrompt(payload);
}
```

### Figma MCP client

The MCP client requires a reachable Figma MCP server. Configure it through
`FIGMA_MCP_URL` and the optional `FIGMA_MCP_TOKEN` environment variable.

```typescript
import { experimental, loadFigmaMcpConfig } from '@uimatch/cli';

const client = new experimental.FigmaMcpClient(loadFigmaMcpConfig());
const reference = await client.getCurrentSelectionRef();
```

There is no `.uimatchrc.json` `experimental` section. MCP connection settings
come from the environment, while comparison settings use the normal project
configuration described in the [CLI reference](./cli-reference.md#custom-configuration).

## Feedback

If you have feedback or use cases, please
[open an issue](https://github.com/kosaki08/uimatch/issues).
