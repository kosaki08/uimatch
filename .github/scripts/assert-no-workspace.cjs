#!/usr/bin/env node
// Read package.json from stdin and assert no "workspace:" in publish-relevant fields

let data = '';

process.stdin.on('data', (chunk) => {
  data += chunk;
});

process.stdin.on('end', () => {
  const json = JSON.parse(data);

  // Skip private packages
  if (json.private) process.exit(0);

  const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies'];
  const bad = [];

  const hasWorkspace = (obj, path) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('workspace:')) {
        bad.push(`${path}.${k}=${v}`);
      }
    }
  };

  for (const f of fields) hasWorkspace(json[f], f);

  if (bad.length) {
    console.error('workspace: protocol leaked in publish-relevant fields:\n' + bad.join('\n'));
    process.exit(1);
  }
});
