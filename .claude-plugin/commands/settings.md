---
name: 'uiMatch Settings'
description: 'View and configure uiMatch default settings and thresholds'
version: '0.1.0'
dependencies: 'Node.js >=22.11.0'
---

# uiMatch Settings Command

This command allows users to view and update default configuration for uiMatch comparisons, including thresholds, ignore lists, weights, and font preloading.

## Trigger Conditions

Use this command when:

- User asks to "configure uiMatch" or "change settings"
- User wants to set default thresholds for all comparisons
- User needs to ignore specific CSS properties globally
- User wants to configure font preload URLs
- User asks "what are the current settings?"

## Prerequisites

- Write access to the project directory (for saving configuration)
- Optional: Existing `.uimatchrc.json` or `uimatch.config.js` file

## Execution Steps

### 1. View Current Settings

When user requests to see current settings:

```typescript
import { loadConfig } from 'uimatch-core';

const config = loadConfig(); // Loads from .uimatchrc.json or defaults

console.log('Current uiMatch Configuration:');
console.log(JSON.stringify(config, null, 2));
```

**Default settings**:

```json
{
  "thresholds": {
    "pixelDiffRatio": 0.03,
    "deltaE": 3.0
  },
  "ignore": [],
  "weights": {
    "color": 1.0,
    "spacing": 1.0,
    "radius": 1.0,
    "border": 1.0,
    "shadow": 1.0,
    "typography": 1.0
  },
  "fontPreload": [],
  "viewport": {
    "width": 1440,
    "height": 900
  },
  "dpr": 1
}
```

### 2. Update Settings

When user requests to change settings:

```typescript
import fs from 'fs';
import path from 'path';

// Load current config
const configPath = path.join(process.cwd(), '.uimatchrc.json');
let config = {};

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Update specific fields
config.thresholds = {
  ...config.thresholds,
  deltaE: 2.0, // User requested stricter color threshold
};

// Save updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('✅ Settings updated successfully');
```

### 3. Reset to Defaults

```typescript
import fs from 'fs';
import { DEFAULT_CONFIG } from 'uimatch-core';

const configPath = path.join(process.cwd(), '.uimatchrc.json');
fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));

console.log('✅ Settings reset to defaults');
```

## Usage Examples

### Example 1: View Current Settings

**User input**:
"Show me the current uiMatch settings"

**Response**:

```
Current uiMatch Configuration:
─────────────────────────────────

Thresholds:
  Pixel difference ratio: 3% (0.03)
  Color delta E: 3.0

Ignored properties: (none)

Category weights: (all 1.0)

Font preload URLs: (none)

Default viewport: 1440x900
Device pixel ratio: 1
```

### Example 2: Update Color Threshold

**User input**:
"Set color threshold to 2.0 for stricter matching"

**Execution**:

```typescript
config.thresholds.deltaE = 2.0;
saveConfig(config);
```

**Response**:

```
✅ Updated color threshold to 2.0
Previous: 3.0
New: 2.0

This will make color matching stricter.
```

### Example 3: Ignore Font Properties

**User input**:
"Ignore font-family and font-kerning in all comparisons"

**Execution**:

```typescript
config.ignore = ['font-family', 'font-kerning'];
saveConfig(config);
```

**Response**:

```
✅ Updated ignore list:
  - font-family
  - font-kerning

These properties will be excluded from all future style comparisons.
```

### Example 4: Configure Font Preload

**User input**:
"Add Google Fonts Inter to preload list"

**Execution**:

```typescript
config.fontPreload = [
  'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2',
];
saveConfig(config);
```

**Response**:

```
✅ Added font to preload list:
  https://fonts.gstatic.com/.../inter/...woff2

This font will be preloaded before capturing screenshots to reduce rendering variance.
```

### Example 5: Adjust Category Weights

**User input**:
"Make spacing more important than typography"

**Execution**:

```typescript
config.weights.spacing = 1.5;
config.weights.typography = 0.8;
saveConfig(config);
```

**Response**:

```
✅ Updated category weights:
  spacing: 1.5 (↑ from 1.0)
  typography: 0.8 (↓ from 1.0)

Spacing differences will have higher severity impact.
```

## Configuration File Formats

### .uimatchrc.json (JSON)

```json
{
  "thresholds": {
    "pixelDiffRatio": 0.02,
    "deltaE": 2.5
  },
  "ignore": ["font-family"],
  "weights": {
    "color": 1.2,
    "spacing": 1.0
  },
  "fontPreload": [
    "https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2"
  ],
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "dpr": 2
}
```

### uimatch.config.js (JavaScript)

```javascript
export default {
  thresholds: {
    pixelDiffRatio: 0.02,
    deltaE: 2.5,
  },
  ignore: ['font-family'],
  fontPreload: ['https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2'],
};
```

## Setting Categories

### 1. Thresholds

Acceptance criteria for comparison quality gates:

- `pixelDiffRatio` (0-1): Maximum acceptable pixel difference ratio
  - Default: 0.03 (3%)
  - Recommended: 0.01-0.05

- `deltaE` (0-100): Maximum acceptable color difference (CIEDE2000)
  - Default: 3.0 (just noticeable difference)
  - Recommended: 1.5-5.0

### 2. Ignore List

CSS properties to exclude from style comparison:

Common properties to ignore:

- `font-family` - Fonts may render differently across systems
- `font-kerning` - Platform-specific rendering
- `letter-spacing` - Minor rendering differences
- `text-rendering` - Browser-specific

### 3. Weights

Relative importance of style categories (0-2):

- `color`: Color properties (color, background-color, border-color)
- `spacing`: Padding, margin, gap
- `radius`: Border-radius
- `border`: Border-width
- `shadow`: Box-shadow
- `typography`: Font-size, line-height, font-weight

Higher weight = higher severity for differences in that category.

### 4. Font Preload

List of font URLs to preload before screenshot capture:

- Reduces rendering variance from font loading
- Use direct links to WOFF2 files
- Google Fonts example: `https://fonts.gstatic.com/s/[font-name]/...`

### 5. Viewport & DPR

Default viewport and device pixel ratio:

- `viewport.width`: Default 1440px
- `viewport.height`: Default 900px
- `dpr`: Default 1 (match Figma export scale)

## Error Handling

### Config File Not Found

If no config file exists, defaults are used. Settings command can create a new config file.

### Invalid JSON

**Error**: `Unexpected token in JSON`

**Solution**:

1. Check for syntax errors in `.uimatchrc.json`
2. Validate JSON format
3. Reset to defaults if corrupted

### Permission Denied

**Error**: `EACCES: permission denied`

**Solution**:

1. Check write permissions for project directory
2. Run with appropriate permissions
3. Try saving to user home directory instead

## Interactive Configuration

For a better user experience, provide an interactive prompt:

```typescript
// Pseudo-code for interactive config
const answers = await prompt([
  {
    type: 'number',
    name: 'pixelDiffRatio',
    message: 'Pixel difference threshold (0-1):',
    default: 0.03,
  },
  {
    type: 'number',
    name: 'deltaE',
    message: 'Color difference threshold (deltaE):',
    default: 3.0,
  },
  {
    type: 'checkbox',
    name: 'ignore',
    message: 'Properties to ignore:',
    choices: ['font-family', 'font-kerning', 'letter-spacing'],
  },
]);

saveConfig(answers);
```

## Environment Variables

Settings can also be configured via environment variables (highest priority):

- `UIMATCH_PIXEL_THRESHOLD`: Override `thresholds.pixelDiffRatio`
- `UIMATCH_COLOR_THRESHOLD`: Override `thresholds.deltaE`
- `FIGMA_MCP_URL`: Figma MCP server URL
- `BASIC_AUTH_USER`: Basic auth username
- `BASIC_AUTH_PASS`: Basic auth password

## Priority Order

Configuration is loaded in this priority (highest to lowest):

1. Environment variables
2. `.uimatchrc.json` in current directory
3. `uimatch.config.js` in current directory
4. Default values from `uimatch-core`

## See Also

- `/uiMatch compare` - Use configured defaults
- `/uiMatch loop` - Respects threshold settings
