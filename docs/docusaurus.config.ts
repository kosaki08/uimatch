import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'UI Match',
  tagline:
    'Compare Figma designs with your implementation—pixel diffs, quality gates, and selector anchors.',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://kosaki08.github.io',
  // For GitHub pages deployment
  baseUrl: '/ui-match/',

  // GitHub pages deployment config
  organizationName: 'kosaki08', // Your GitHub org/user name
  projectName: 'ui-match', // Your repo name

  onBrokenLinks: 'throw',

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
          editUrl: 'https://github.com/kosaki08/ui-match/tree/main/docs/',
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
        entryPoints: [
          '../packages/uimatch-core/src/index.ts',
          '../packages/uimatch-plugin/src/index.ts',
          '../packages/uimatch-selector-spi/src/index.ts',
          '../packages/uimatch-selector-anchors/src/index.ts',
          '../packages/uimatch-scoring/src/index.ts',
        ],
        entryPointStrategy: 'expand',
        tsconfig: '../tsconfig.json',
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
      title: 'UI Match',
      logo: {
        alt: 'UI Match Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Guide',
        },
        {
          href: 'https://github.com/kosaki08/ui-match',
          label: 'GitHub',
          position: 'right',
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
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/kosaki08/ui-match',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} UI Match. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
