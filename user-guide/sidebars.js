// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'uShadow',
      collapsed: false,
      link: { type: 'doc', id: 'ushadow/intro' },
      items: [
        {
          type: 'category',
          label: 'Launcher',
          link: { type: 'doc', id: 'ushadow/launcher/intro' },
          items: [
            {
              type: 'category',
              label: 'Getting Started',
              items: [
                'ushadow/launcher/getting-started/quickstart',
                'ushadow/launcher/getting-started/platform-support',
              ],
            },
            {
              type: 'category',
              label: 'Core Concepts',
              items: [
                'ushadow/launcher/concepts/worktrees',
                'ushadow/launcher/concepts/environments',
              ],
            },
            {
              type: 'category',
              label: 'Features',
              items: [
                'ushadow/launcher/guides/tmux-integration',
                'ushadow/launcher/guides/kanban-integration',
                'ushadow/launcher/guides/kanban-hooks',
                'ushadow/launcher/guides/kanban-auto-status',
                'ushadow/launcher/guides/cross-platform-terminal',
              ],
            },
            {
              type: 'category',
              label: 'Configuration',
              items: [
                'ushadow/launcher/guides/custom-projects',
                'ushadow/launcher/guides/documentation-platforms',
                'ushadow/launcher/guides/docs-quickstart',
                'ushadow/launcher/guides/generic-installer',
                'ushadow/launcher/guides/windows-fixes',
              ],
            },
            {
              type: 'category',
              label: 'Development',
              items: [
                'ushadow/launcher/development/testing',
                'ushadow/launcher/development/releasing',
                'ushadow/launcher/development/agent-self-reporting',
                'ushadow/launcher/development/kanban-state-commands',
              ],
            },
            'ushadow/launcher/changelog',
            'ushadow/launcher/roadmap',
          ],
        },
        {
          type: 'category',
          label: 'Deployment',
          link: { type: 'doc', id: 'ushadow/deployment/intro' },
          items: [],
        },
        {
          type: 'category',
          label: 'Settings',
          link: { type: 'doc', id: 'ushadow/settings/intro' },
          items: [],
        },
        {
          type: 'category',
          label: 'Conversations',
          link: { type: 'doc', id: 'ushadow/conversations/intro' },
          items: [],
        },
        {
          type: 'category',
          label: 'Mobile',
          link: { type: 'doc', id: 'ushadow/mobile/intro' },
          items: [],
        },
        {
          type: 'category',
          label: 'Memory',
          link: { type: 'doc', id: 'ushadow/memory/intro' },
          items: [],
        },
      ],
    },
  ],
};

export default sidebars;
