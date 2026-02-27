---
title: Quickstart Guide
sidebar_position: 1
---


This guide helps you quickly set up documentation for the launcher project.

## Overview

We've created comprehensive documentation for configuring the launcher for custom projects:

1. **CUSTOM_PROJECT_GUIDE.md** - Complete configuration guide
2. **DOCUMENTATION_PLATFORMS.md** - Platform comparison and recommendations
3. **This file** - Quick start to get docs online

## 5-Minute Setup: GitHub Pages

The fastest way to get documentation online:

### Step 1: Enable GitHub Pages

```bash
# In your launcher repo
cd ushadow/launcher

# Create docs directory (if not exists)
mkdir -p docs

# Copy guides to docs
cp CUSTOM_PROJECT_GUIDE.md docs/configuration-guide.md
cp DOCUMENTATION_PLATFORMS.md docs/platforms.md

# Create index page
cat > docs/index.md << 'EOF'
# Launcher Documentation

Welcome to the Launcher documentation!

## Quick Links

- [Configuration Guide](configuration-guide.md) - Configure the launcher for your project
- [Documentation Platforms](platforms.md) - Choose a documentation hosting platform

## What is the Launcher?

A powerful Tauri-based development environment orchestration tool that provides:

- 🌲 Git worktree management
- 💻 Tmux session integration
- 🐳 Docker container orchestration
- 📋 Kanban board (optional)
- ⚙️ Multi-platform support

## Getting Started

1. [Install Prerequisites](configuration-guide.md#prerequisites)
2. [Configure for Your Project](configuration-guide.md#step-by-step-configuration)
3. [Build and Distribute](configuration-guide.md#building-and-distribution)

## Need Help?

- Check the [Configuration Guide](configuration-guide.md)
- Review [Troubleshooting](configuration-guide.md#troubleshooting)
- File an issue on GitHub
EOF

# Enable Jekyll (GitHub Pages processor)
echo "theme: jekyll-theme-cayman" > docs/_config.yml
```

### Step 2: Push and Enable

```bash
git add docs/
git commit -m "docs: add launcher configuration documentation"
git push
```

Then:
1. Go to your GitHub repo → **Settings** → **Pages**
2. Source: Select **Deploy from a branch**
3. Branch: Select **main** and **/docs**
4. Click **Save**

Your docs will be live at: `https://yourusername.github.io/launcher/`

**Total time**: ~5 minutes

---

## 30-Minute Setup: Docusaurus

For a professional, feature-rich documentation site:

### Step 1: Create Docusaurus Site

```bash
# Create new directory for docs site
cd /path/to/your/projects
npx create-docusaurus@latest launcher-docs classic

cd launcher-docs
```

### Step 2: Structure Content

```bash
# Create documentation structure
mkdir -p docs/getting-started
mkdir -p docs/configuration
mkdir -p docs/guides
mkdir -p docs/building
mkdir -p docs/troubleshooting

# Copy existing guides
cp ../launcher/CUSTOM_PROJECT_GUIDE.md docs/guides/custom-project.md
cp ../launcher/DOCUMENTATION_PLATFORMS.md docs/reference/platforms.md

# Create homepage
cat > docs/intro.md << 'EOF'
---
sidebar_position: 1
---

# Introduction

The Launcher is a powerful desktop application for orchestrating development environments with git worktrees, tmux, and Docker.

## Key Features

- 🌲 **Git Worktrees** - Work on multiple branches simultaneously
- 💻 **Tmux Integration** - Persistent terminal sessions
- 🐳 **Docker Orchestration** - Environment-specific containers
- 📋 **Kanban Board** - Integrated ticket management
- 🚀 **One-Click Setup** - Automated environment creation

## Quick Start

1. [Install the launcher](./getting-started/installation)
2. [Configure for your project](./guides/custom-project)
3. [Create your first worktree](./getting-started/quick-start)

## Why Use the Launcher?

Traditional development workflows require juggling multiple terminal windows, manually switching branches, and remembering which containers belong to which feature. The launcher solves this by providing a unified interface for managing parallel development environments.
EOF
```

### Step 3: Customize Branding

Edit `docusaurus.config.js`:

```javascript
module.exports = {
  title: 'Launcher Docs',
  tagline: 'Development Environment Orchestration',
  url: 'https://yourdomain.com',
  baseUrl: '/',
  favicon: 'img/favicon.ico',

  themeConfig: {
    navbar: {
      title: 'Launcher',
      items: [
        {
          type: 'doc',
          docId: 'intro',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/yourorg/launcher',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Your Project`,
    },
  },
}
```

### Step 4: Local Preview

```bash
npm start
```

Opens at `http://localhost:3000`

### Step 5: Deploy

**Option A: Netlify** (Recommended)

1. Push to GitHub
2. Go to https://app.netlify.com/
3. Click "New site from Git"
4. Select your repo
5. Build command: `npm run build`
6. Publish directory: `build`

**Live in 2 minutes!**

**Option B: Vercel**

```bash
npm install -g vercel
vercel --prod
```

**Option C: GitHub Pages**

```bash
# Configure
GIT_USER=yourusername npm run deploy
```

---

## Recommended Documentation Structure

Here's the ideal structure for launcher documentation:

```
docs/
├── intro.md                           # Overview
│
├── getting-started/
│   ├── installation.md               # Install launcher
│   ├── quick-start.md                # Create first worktree
│   └── concepts.md                   # Core concepts
│
├── configuration/
│   ├── tauri-config.md               # tauri.conf.json
│   ├── prerequisites.md              # prerequisites.yaml
│   ├── workmux.md                    # .workmux.yaml
│   ├── bundling.md                   # bundle-resources.sh
│   └── package.md                    # package.json
│
├── guides/
│   ├── custom-project.md             # Full guide (already created!)
│   ├── add-features.md               # Add custom features
│   ├── customize-ui.md               # Modify frontend
│   ├── kanban-integration.md         # Optional Kanban
│   └── multi-project.md              # Multi-project mode
│
├── building/
│   ├── development.md                # Dev builds
│   ├── production.md                 # Release builds
│   ├── code-signing.md               # Signing & notarization
│   ├── ci-cd.md                      # GitHub Actions
│   └── distribution.md               # App Store, direct download
│
├── troubleshooting/
│   ├── common-issues.md              # FAQ
│   ├── debugging.md                  # Debug techniques
│   └── platform-specific.md          # OS-specific issues
│
├── api/
│   ├── tauri-commands.md             # Rust command reference
│   ├── config-schema.md              # YAML schemas
│   └── hooks.md                      # Workmux hooks
│
└── reference/
    ├── platforms.md                  # Platform comparison (already created!)
    └── changelog.md                  # Version history
```

---

## Content Migration Checklist

If moving from basic docs to Docusaurus:

- [ ] Copy existing Markdown files to `docs/`
- [ ] Add frontmatter to each file:
  ```yaml
  ---
  sidebar_position: 1
  title: Page Title
  ---
  ```
- [ ] Update internal links to use relative paths
- [ ] Add code block language identifiers:
  ````markdown
  ```bash
  npm install
  ```
  ````
- [ ] Add screenshots to `static/img/`
- [ ] Create sidebar structure in `sidebars.js`
- [ ] Customize theme in `docusaurus.config.js`
- [ ] Test all links work
- [ ] Deploy to hosting platform

---

## Adding Screenshots

Visual documentation is crucial for a UI-heavy project like the launcher:

### Step 1: Capture Screenshots

Take screenshots of:
- Main launcher window
- Worktree creation dialog
- Environment management panel
- Kanban board (if used)
- Prerequisites checker
- Settings/configuration screens

### Step 2: Optimize Images

```bash
# Install image optimization tool
npm install -g imagemin-cli

# Optimize all screenshots
imagemin screenshots/*.png --out-dir=docs/static/img/
```

### Step 3: Add to Documentation

```markdown
## Creating a Worktree

Click the "New Environment" button to create a new git worktree:

![New Environment Dialog](./img/new-environment-dialog.png)

The launcher will:
1. Create the git worktree
2. Set up environment-specific configuration
3. Start tmux session
4. Launch containers
```

---

## Search Setup (Optional but Recommended)

### Algolia DocSearch (Free for Open Source)

1. Apply at: https://docsearch.algolia.com/apply/
2. Once approved, add to `docusaurus.config.js`:

```javascript
themeConfig: {
  algolia: {
    apiKey: 'your-api-key',
    indexName: 'launcher-docs',
    appId: 'your-app-id',
  },
}
```

### Local Search Plugin (Free, No Account)

```bash
npm install @easyops-cn/docusaurus-search-local
```

Add to `docusaurus.config.js`:

```javascript
plugins: [
  [
    require.resolve("@easyops-cn/docusaurus-search-local"),
    {
      hashed: true,
      language: ["en"],
    },
  ],
],
```

---

## Analytics Setup (Optional)

Track how users interact with your docs:

### Google Analytics

Add to `docusaurus.config.js`:

```javascript
themeConfig: {
  gtag: {
    trackingID: 'G-XXXXXXXXXX',
  },
}
```

### Plausible (Privacy-Friendly)

```bash
npm install docusaurus-plugin-plausible
```

```javascript
plugins: [
  [
    'docusaurus-plugin-plausible',
    {
      domain: 'docs.yourdomain.com',
    },
  ],
],
```

---

## Versioning Strategy

As the launcher evolves, maintain documentation for multiple versions:

### Create Version

```bash
npm run docusaurus docs:version 1.0.0
```

This creates:
- `versioned_docs/version-1.0.0/` - Frozen docs for v1.0.0
- `versions.json` - List of versions
- Version dropdown in navbar

### Update Current Docs

Continue editing `docs/` for the next version. Previous versions stay frozen.

---

## Maintenance Plan

### Weekly
- [ ] Check for broken links
- [ ] Update screenshots if UI changed
- [ ] Add new FAQ entries from user questions

### Per Release
- [ ] Create version snapshot
- [ ] Update changelog
- [ ] Announce in docs homepage banner

### Monthly
- [ ] Review analytics to see popular pages
- [ ] Improve low-performing pages
- [ ] Add requested content

---

## Example: Complete Setup Script

Here's a script that sets up everything:

```bash
#!/bin/bash
# setup-docs.sh - Complete documentation setup

set -e

echo "🚀 Setting up Launcher Documentation..."

# Create Docusaurus site
npx create-docusaurus@latest launcher-docs classic --skip-install
cd launcher-docs

# Install dependencies
npm install

# Create structure
mkdir -p docs/{getting-started,configuration,guides,building,troubleshooting,api,reference}
mkdir -p static/img

# Copy existing guides
cp ../launcher/CUSTOM_PROJECT_GUIDE.md docs/guides/custom-project.md
cp ../launcher/DOCUMENTATION_PLATFORMS.md docs/reference/platforms.md

# Create intro
cat > docs/intro.md << 'EOF'
---
sidebar_position: 1
slug: /
---

# Welcome to Launcher Docs

Development environment orchestration made easy.

[Get Started →](./getting-started/installation)
EOF

# Configure
cat > docusaurus.config.js << 'EOF'
module.exports = {
  title: 'Launcher Docs',
  tagline: 'Orchestrate development environments with ease',
  url: 'https://yourusername.github.io',
  baseUrl: '/launcher-docs/',
  organizationName: 'yourusername',
  projectName: 'launcher-docs',

  themeConfig: {
    navbar: {
      title: 'Launcher',
      items: [
        {
          type: 'doc',
          docId: 'intro',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/yourusername/launcher',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
  },

  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
};
EOF

echo "✅ Documentation site created!"
echo ""
echo "Next steps:"
echo "  1. cd launcher-docs"
echo "  2. npm start              # Preview locally"
echo "  3. npm run build          # Build for production"
echo "  4. npm run deploy         # Deploy to GitHub Pages"
```

---

## Final Checklist

Before going live:

- [ ] All pages have proper titles and descriptions
- [ ] Code examples are tested and working
- [ ] Screenshots are clear and up-to-date
- [ ] Internal links work
- [ ] External links open in new tabs
- [ ] Mobile view looks good
- [ ] Dark mode works (if supported)
- [ ] Search is functional
- [ ] 404 page is customized
- [ ] Analytics are tracking
- [ ] Social media preview images are set
- [ ] Feedback mechanism exists (GitHub issues link)

---

## Resources

- **Docusaurus Guide**: https://docusaurus.io/docs
- **Markdown Guide**: https://www.markdownguide.org/
- **Technical Writing**: https://developers.google.com/tech-writing
- **Screenshot Tools**:
  - macOS: Cmd+Shift+4 (built-in)
  - Windows: Snipping Tool
  - Linux: Flameshot, GNOME Screenshot

---

## Support

Questions about documentation setup?

- 📧 Open an issue on GitHub
- 💬 Ask in discussions
- 📖 Check Docusaurus docs

**Happy Documenting!** 📚
