---
sidebar_position: 6
---

# Experimental Features

:::warning Extra Unstable
While uiMatch itself is in **0.x (experimental)** and subject to change, the features on this page are **even more unstable** and experimental.

They may be removed or significantly changed without notice. These are primarily intended for MCP / AI assistant integration experiments. Please avoid relying on them in long-term CI/CD pipelines.
:::

## Experimental Commands

### `experimental claude-report`

Generate Claude-optimized comparison report.

:::warning Work in Progress
This command is currently a **proof-of-concept** and not fully functional. The `--format` option does not produce formatted output due to architectural limitations (the underlying `runCompare` function does not return `CompareResult`).

For now, use the standard `uimatch compare` command output instead.
:::

**Syntax**:

```shell
uimatch experimental claude-report --figma <reference> --url <url> [options]
```

**Options**:

- `--format=prompt` - Output as LLM prompt (default) **[Not yet functional]**
- `--format=json` - Output as structured JSON **[Not yet functional]**

**Example**:

```shell
# Currently shows standard compare output with a PoC notice
uimatch experimental claude-report \
  --figma current \
  --url http://localhost:3000 \
  --format=json
```

## Experimental Configuration

Add experimental settings to `.uimatchrc.json`:

```json
{
  "experimental": {
    "claude": {
      "format": "prompt",
      "includeRawDiffs": false
    },
    "mcp": {
      "enabled": false
    }
  }
}
```

### Configuration Options

| Option                                | Type                   | Default    | Description                          |
| ------------------------------------- | ---------------------- | ---------- | ------------------------------------ |
| `experimental.claude.format`          | `"prompt"` \| `"json"` | `"prompt"` | Output format for Claude integration |
| `experimental.claude.includeRawDiffs` | `boolean`              | `false`    | Include raw diff data in output      |
| `experimental.mcp.enabled`            | `boolean`              | `false`    | Enable MCP server integration        |

## Experimental TypeScript API

:::caution
The experimental API is subject to breaking changes. Use in production at your own risk.
:::

### LLM Formatting

```typescript
import { experimental } from '@uimatch/cli';

// Claude-specific formatting
const payload = experimental.formatForLLM(result, { preferTokens: true });
const prompt = experimental.generateLLMPrompt(payload);
```

### Figma MCP Client

Requires MCP server running.

```typescript
import { experimental } from '@uimatch/cli';

// Initialize MCP client
const mcpClient = new experimental.FigmaMcpClient(config);

// Get current Figma selection
const ref = await mcpClient.getCurrentSelectionRef();
```

## Use Cases

### AI-Assisted Design Review

Use the `claude-report` command to generate reports optimized for AI assistant consumption:

```shell
# Generate prompt for Claude Code
uimatch experimental claude-report \
  --figma current \
  --url http://localhost:3000 \
  --format=prompt
```

### MCP Integration

Enable MCP server integration for enhanced Figma workflows:

```json
{
  "experimental": {
    "mcp": {
      "enabled": true
    }
  }
}
```

## Feedback

Experimental features help us explore new integration patterns. If you have feedback or use cases, please [open an issue](https://github.com/kosaki08/uimatch/issues).
