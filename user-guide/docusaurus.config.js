// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'uShadow User Guide',
  tagline: 'Documentation for the uShadow platform',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.ushadow.io',
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'Ushadow-io',
  projectName: 'Ushadow',
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'warn',

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
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/Ushadow-io/Ushadow/tree/main/user-guide/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'uShadow',
        logo: {
          alt: 'uShadow Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'User Guide',
          },
          {
            href: 'https://github.com/Ushadow-io/Ushadow',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'uShadow',
            items: [
              { label: 'User Guide', to: '/' },
              { label: 'Launcher', to: '/ushadow/launcher/intro' },
              { label: 'Deployment', to: '/ushadow/deployment/intro' },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/Ushadow-io/Ushadow',
              },
              {
                label: 'Launcher Changelog',
                to: '/ushadow/launcher/changelog',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} uShadow Project. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
