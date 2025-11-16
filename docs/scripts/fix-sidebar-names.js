/**
 * Post-process TypeDoc sidebar to use @uimatch/* package names
 * and fix document ID paths for Docusaurus
 */
const fs = require('fs');
const path = require('path');

const sidebarPath = path.join(__dirname, '../docs/api/typedoc-sidebar.cjs');

if (!fs.existsSync(sidebarPath)) {
  console.log('Sidebar file not found, skipping...');
  process.exit(0);
}

let content = fs.readFileSync(sidebarPath, 'utf8');

// Replace directory names with package names
const replacements = {
  '"uimatch-core"': '"@uimatch/core"',
  '"uimatch-cli"': '"@uimatch/cli"',
  '"uimatch-scoring"': '"@uimatch/scoring"',
  '"uimatch-selector-spi"': '"@uimatch/selector-spi"',
  // selector-anchors already correct
};

for (const [old, newName] of Object.entries(replacements)) {
  content = content.replace(new RegExp(old, 'g'), newName);
}

fs.writeFileSync(sidebarPath, content, 'utf8');
console.log('✅ Sidebar names fixed');
