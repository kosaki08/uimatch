# uiMatch Common Environment Notes

## Figma token

uiMatch CLI does **not** load `.env` files automatically.
Before running any `uimatch` command, you must export the Figma token in the shell:

```bash
export FIGMA_ACCESS_TOKEN="figd_..."
```

Notes:

- Do not rely on `.env` unless you have your own Node.js script that calls uiMatch programmatically and loads `dotenv`.
- For plain CLI usage (`npx uimatch ...`), the environment variable must be exported.

## Figma reference and shell quoting

Prefer `FILE_KEY:NODE_ID` format whenever possible:

```bash
figma=AbCdEf123:1-2
```

If you use a full Figma URL, **always quote it** to avoid shell parsing issues:

```bash
figma='https://www.figma.com/file/AbCdEf123/MyDesign?type=design&node-id=1-2&mode=design'
```

Unquoted characters like `?`, `&`, `=` can cause the shell to treat parts of the URL as separate arguments and make the command fail.
