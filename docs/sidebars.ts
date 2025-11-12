import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Import TypeDoc generated sidebar with fallback for initial builds
let apiItems: any[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const typedoc = require('./docs/api/typedoc-sidebar.cjs');
  apiItems = Array.isArray(typedoc) ? typedoc : (typedoc.items ?? []);
} catch {
  // Fallback when TypeDoc hasn't generated the sidebar yet
  apiItems = [{ type: 'link', label: 'Open API Reference', href: '/docs/api' }];
}

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'getting-started',
    'cli-reference',
    'concepts',
    'troubleshooting',
    'plugins',
    {
      type: 'category',
      label: 'API',
      collapsed: false,
      items: apiItems,
    },
  ],
};

export default sidebars;
