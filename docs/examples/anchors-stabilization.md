# Selector Stabilization with Anchors

Use AST-based anchors to survive code refactoring and line number changes.

## Use Case

- Selectors break when code changes
- Components move between files
- Test IDs not available
- Need stable selectors across refactors

## Setup

```bash
# Install selector plugin
npm install -g @uimatch/selector-anchors

# Add anchor for Button component
npx uimatch-anchors \
  --file src/components/Button.tsx \
  --line 42 \
  --column 10 \
  --id btn-primary
```

## anchors.json (Minimal)

```json
{
  "version": "1.0.0",
  "anchors": [
    {
      "id": "btn-primary",
      "source": {
        "file": "src/components/Button.tsx",
        "line": 42,
        "col": 10
      }
    }
  ]
}
```

## anchors.json (Recommended)

```json
{
  "version": "1.0.0",
  "anchors": [
    {
      "id": "btn-primary",
      "source": {
        "file": "src/components/Button.tsx",
        "line": 42,
        "col": 10
      },
      "hint": {
        "prefer": ["testid", "role", "text"],
        "testid": "button-primary",
        "role": "button",
        "expectedText": "Submit"
      },
      "snippetHash": "a3f2c9d8e1",
      "meta": {
        "component": "Button",
        "description": "Primary action button"
      }
    }
  ]
}
```

## Use with uiMatch

```bash
npx uimatch compare \
  figma=AbCdEf:1-23 \
  story=http://localhost:6006/?path=/story/button \
  selector=".initial-selector" \
  selectors=./anchors.json \
  selectorsPlugin=@uimatch/selector-anchors
```

## How It Works

1. **Snippet Hash Matching**: Detects code movement via fuzzy match
2. **AST Resolution**: Extracts selectors from TypeScript/JSX
3. **Liveness Check**: Verifies selector works in browser
4. **Stability Scoring**: Ranks candidates (testid=100, role=80, css=30)

## Stability Score Breakdown

- **Hint Quality (40%)**: testid > role > text > css
- **Snippet Match (20%)**: Code location matched
- **Liveness (30%)**: Browser validation passed
- **Specificity (10%)**: data-testid > role > id > class

See [Selector Resolution](../concepts/selector-resolution.md) for details.

## Troubleshooting

| Issue                    | Solution                                                       |
| ------------------------ | -------------------------------------------------------------- |
| Snippet hash not matched | Code moved >400 lines or file renamed                          |
| Low stability score      | Add `hint.testid` or `hint.role` to anchors.json               |
| Selector not found       | Check `resolvedCss` field - may be stale, remove it to recheck |
| Plugin not loaded        | Verify `selectorsPlugin` path and package installed            |

## Config

```json
{
  "selectors": {
    "anchorsPath": "./anchors.json",
    "pluginName": "@uimatch/selector-anchors",
    "writeBack": true
  }
}
```

**writeBack**: Updates `resolvedCss`, `lastSeen`, and `lastKnown` for faster future lookups.
