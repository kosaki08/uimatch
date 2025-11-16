import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';
import packageJson from '../packages/uimatch-cli/package.json';

const config: Config = {
  title: 'uiMatch',
  tagline:
    'Compare Figma designs with your implementation—pixel diffs, quality gates, and selector anchors.',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://kosaki08.github.io',
  // For GitHub pages deployment
  baseUrl: '/uimatch/',

  // GitHub pages deployment config
  organizationName: 'kosaki08', // Your GitHub org/user name
  projectName: 'uimatch', // Your repo name

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/kosaki08/uimatch/tree/main/docs/',
        },
        blog: false, // Disable blog for MVP
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api',
        // entryPoints: packages directory (not src/index.ts)
        entryPoints: [
          '../packages/uimatch-core',
          '../packages/uimatch-cli',
          '../packages/uimatch-selector-spi',
          '../packages/uimatch-selector-anchors',
          '../packages/uimatch-scoring',
        ],
        // Use 'packages' strategy to show @uimatch/* scope names
        entryPointStrategy: 'packages',
        tsconfig: '../tsconfig.json',
        // Output to docs/api (relative to docs/) - Docusaurus docs root is docs/docs/
        out: 'docs/api',
        sidebar: {
          pretty: true,
        },
        excludePrivate: true,
        excludeProtected: false,
        excludeExternals: true,
        excludeInternal: true,
        readme: 'none',
        hideBreadcrumbs: true,
        useCodeBlocks: true,
        expandObjects: false,
      },
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'uiMatch',
      logo: {
        alt: 'uiMatch Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'html',
          position: 'right',
          value: `v${packageJson.version}`,
        },
        {
          href: 'https://github.com/kosaki08/uimatch',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'CLI Reference',
              to: '/docs/cli-reference',
            },
            {
              label: 'CI Integration',
              to: '/docs/ci-integration',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Local Testing',
              to: '/docs/local-testing',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/kosaki08/uimatch',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} uiMatch. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
