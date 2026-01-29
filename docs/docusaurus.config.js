// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'IntelliFlow CRM',
  tagline: 'AI-Powered CRM System - Documentation',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://intelliflow-crm.dev',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'intelliflow',
  projectName: 'intelliflow-crm',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          // Edit URL for GitHub
          editUrl: 'https://github.com/intelliflow/intelliflow-crm/tree/main/docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Social card
      image: 'img/intelliflow-social-card.jpg',
      navbar: {
        title: 'IntelliFlow CRM',
        logo: {
          alt: 'IntelliFlow CRM Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            type: 'docSidebar',
            sidebarId: 'apiSidebar',
            position: 'left',
            label: 'API',
          },
          {
            type: 'docSidebar',
            sidebarId: 'guidesSidebar',
            position: 'left',
            label: 'Guides',
          },
          {
            type: 'docSidebar',
            sidebarId: 'architectureSidebar',
            position: 'left',
            label: 'Architecture',
          },
          {
            href: 'https://github.com/intelliflow/intelliflow-crm',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Getting Started',
                to: '/guides/getting-started',
              },
              {
                label: 'Architecture',
                to: '/architecture/overview',
              },
              {
                label: 'API Reference',
                to: '/api/trpc-routes',
              },
            ],
          },
          {
            title: 'Development',
            items: [
              {
                label: 'Developer Guides',
                to: '/guides/development',
              },
              {
                label: 'Contributing',
                to: '/guides/contributing',
              },
              {
                label: 'Testing',
                to: '/guides/testing',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/intelliflow/intelliflow-crm',
              },
              {
                label: 'Issues',
                href: 'https://github.com/intelliflow/intelliflow-crm/issues',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} IntelliFlow CRM. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'typescript', 'javascript', 'json', 'yaml', 'docker', 'sql'],
      },
      algolia: {
        // Algolia search integration (to be configured later)
        appId: 'YOUR_APP_ID',
        apiKey: 'YOUR_SEARCH_API_KEY',
        indexName: 'intelliflow-crm',
        contextualSearch: true,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),

  plugins: [
    // Additional plugins can be added here
    // For example: search, sitemap, pwa, etc.
  ],

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],
};

module.exports = config;
