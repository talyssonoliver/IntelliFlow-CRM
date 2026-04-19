// @ts-check
// Note: type annotations allow type checking and IDE autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'IntelliFlow CRM',
  tagline: 'AI-Powered Customer Relationship Management',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://intelliflow-crm.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/',

  // GitHub pages deployment config
  organizationName: 'intelliflow',
  projectName: 'intelliflow-crm',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Internationalization config
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
          editUrl: 'https://github.com/intelliflow/intelliflow-crm/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
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
      image: 'img/social-card.png',

      navbar: {
        title: 'IntelliFlow CRM',
        logo: {
          alt: 'IntelliFlow CRM Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            type: 'docSidebar',
            sidebarId: 'apiSidebar',
            position: 'left',
            label: 'API Reference',
          },
          {
            type: 'docSidebar',
            sidebarId: 'aiSidebar',
            position: 'left',
            label: 'AI Integration',
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
                to: '/getting-started',
              },
              {
                label: 'Architecture',
                to: '/architecture/overview',
              },
              {
                label: 'API Reference',
                to: '/api/overview',
              },
            ],
          },
          {
            title: 'Development',
            items: [
              {
                label: 'Development Guide',
                to: '/development/overview',
              },
              {
                label: 'Contributing',
                to: '/contributing',
              },
              {
                label: 'Code Style',
                to: '/development/code-style',
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
              {
                label: 'Discussions',
                href: 'https://github.com/intelliflow/intelliflow-crm/discussions',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} IntelliFlow CRM. Built with Docusaurus.`,
      },

      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['typescript', 'javascript', 'bash', 'json', 'yaml', 'docker'],
      },

      // Algolia search (configure when ready)
      algolia: {
        appId: 'YOUR_APP_ID',
        apiKey: 'YOUR_SEARCH_API_KEY',
        indexName: 'intelliflow-crm',
        contextualSearch: true,
      },

      // Announcement bar
      announcementBar: {
        id: 'support_us',
        content:
          '⭐️ If you like IntelliFlow CRM, give it a star on <a target="_blank" rel="noopener noreferrer" href="https://github.com/intelliflow/intelliflow-crm">GitHub</a>! ⭐️',
        backgroundColor: '#fafbfc',
        textColor: '#091E42',
        isCloseable: true,
      },

      // Color mode
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },

      // Metadata
      metadata: [
        { name: 'keywords', content: 'crm, ai, typescript, nextjs, prisma, langchain, documentation' },
        { name: 'description', content: 'AI-Powered CRM system with modern tech stack' },
      ],
    }),

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'docs/api',
        routeBasePath: 'api',
        sidebarPath: require.resolve('./sidebars.js'),
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ai',
        path: 'docs/ai',
        routeBasePath: 'ai',
        sidebarPath: require.resolve('./sidebars.js'),
      },
    ],
  ],

  themes: [
    [
      '@docusaurus/theme-live-codeblock',
      {
        playgroundPosition: 'bottom',
      },
    ],
  ],

  scripts: [
    {
      src: 'https://plausible.io/js/script.js',
      defer: true,
      'data-domain': 'intelliflow-crm.com',
    },
  ],

  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      type: 'text/css',
    },
  ],
};

module.exports = config;
