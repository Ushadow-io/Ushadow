---
title: Documentation Platforms
sidebar_position: 7
---


This guide reviews modern documentation platforms suitable for hosting the launcher's configuration guide and user documentation.

## Quick Recommendations

**Best Overall**: Docusaurus (React-based, feature-rich, free hosting)
**Easiest Setup**: VitePress (Markdown-focused, minimal config)
**Most Beautiful**: Mintlify (AI-powered, stunning design)
**Best for Open Source**: ReadTheDocs (free hosting, autodeploy)

## Platform Comparison

### 1. Docusaurus ⭐ Recommended

**By**: Meta (Facebook)
**Tech**: React, MDX
**Hosting**: Netlify, Vercel, GitHub Pages (free)
**Website**: https://docusaurus.io/

**Pros**:
- ✅ Extremely popular and well-maintained
- ✅ React-based, highly customizable
- ✅ MDX support (Markdown + JSX)
- ✅ Built-in versioning for documentation
- ✅ Excellent search (Algolia DocSearch integration)
- ✅ Multi-language support
- ✅ Plugin ecosystem
- ✅ Dark mode built-in
- ✅ Free hosting on multiple platforms

**Cons**:
- ⚠️ Heavier than simpler options (full React app)
- ⚠️ Slight learning curve for customization
- ⚠️ Slower build times for very large docs

**Best For**: Projects that want a feature-rich, professional docs site with room to grow.

**Setup Time**: ~30 minutes

**Example Command**:
```bash
npx create-docusaurus@latest launcher-docs classic
cd launcher-docs
npm start
```

**Live Examples**:
- React: https://react.dev/
- Jest: https://jestjs.io/
- Tauri: https://tauri.app/

---

### 2. VitePress

**By**: Vue.js Team
**Tech**: Vue 3, Vite, Markdown
**Hosting**: Netlify, Vercel, GitHub Pages (free)
**Website**: https://vitepress.dev/

**Pros**:
- ✅ Extremely fast (powered by Vite)
- ✅ Simple, focused on content
- ✅ Minimal configuration needed
- ✅ Beautiful default theme
- ✅ Great performance (small bundle)
- ✅ Vue components in Markdown
- ✅ Excellent search
- ✅ Free hosting

**Cons**:
- ⚠️ Smaller ecosystem than Docusaurus
- ⚠️ Less mature (newer project)
- ⚠️ Fewer plugins available

**Best For**: Projects that want fast, simple docs without complexity.

**Setup Time**: ~15 minutes

**Example Command**:
```bash
npm init vitepress@latest launcher-docs
cd launcher-docs
npm install
npm run docs:dev
```

**Live Examples**:
- Vue.js: https://vuejs.org/
- Vite: https://vitejs.dev/
- Vitest: https://vitest.dev/

---

### 3. MkDocs Material

**By**: Martin Donath
**Tech**: Python, Markdown
**Hosting**: ReadTheDocs, GitHub Pages, Netlify (free)
**Website**: https://squidfunk.github.io/mkdocs-material/

**Pros**:
- ✅ Beautiful, modern design out of the box
- ✅ Extensive customization options
- ✅ Excellent search
- ✅ Dark mode, multiple color schemes
- ✅ Great for technical documentation
- ✅ Python-based (no Node.js required)
- ✅ Free hosting options
- ✅ Very active development

**Cons**:
- ⚠️ Requires Python environment
- ⚠️ Premium features require sponsorship ($10-15/month)
- ⚠️ Less interactive than React/Vue options

**Best For**: Python projects or teams already using Python tooling.

**Setup Time**: ~20 minutes

**Example Command**:
```bash
pip install mkdocs-material
mkdocs new launcher-docs
cd launcher-docs
mkdocs serve
```

**Live Examples**:
- FastAPI: https://fastapi.tiangolo.com/
- SQLAlchemy: https://docs.sqlalchemy.org/
- Pydantic: https://docs.pydantic.dev/

---

### 4. Nextra

**By**: Vercel
**Tech**: Next.js, React, MDX
**Hosting**: Vercel (free), Netlify, GitHub Pages
**Website**: https://nextra.site/

**Pros**:
- ✅ Next.js-based (modern React framework)
- ✅ Server-side rendering (SEO-friendly)
- ✅ MDX support
- ✅ Beautiful themes (docs & blog)
- ✅ Great search
- ✅ Optimized by Vercel
- ✅ Free hosting on Vercel

**Cons**:
- ⚠️ Newer, smaller community
- ⚠️ Tied to Next.js ecosystem
- ⚠️ Less plugin ecosystem

**Best For**: Next.js projects or teams already using Vercel.

**Setup Time**: ~20 minutes

**Example Command**:
```bash
npx create-next-app launcher-docs --use-npm --example "https://github.com/shuding/nextra/tree/main/examples/docs"
cd launcher-docs
npm run dev
```

**Live Examples**:
- SWR: https://swr.vercel.app/
- Nextra itself: https://nextra.site/

---

### 5. Mintlify ⭐ Beautiful but Premium

**By**: Mintlify (Startup)
**Tech**: Next.js, MDX
**Hosting**: Mintlify Cloud (managed)
**Website**: https://mintlify.com/

**Pros**:
- ✅ Stunning, modern design
- ✅ AI-powered search
- ✅ Integrated API reference
- ✅ Analytics built-in
- ✅ Auto-generated from OpenAPI specs
- ✅ Custom components
- ✅ No infrastructure to manage

**Cons**:
- ⚠️ **Paid service** (free tier limited)
- ⚠️ Vendor lock-in
- ⚠️ Less control over hosting
- ⚠️ Pricing starts at $150/month for teams

**Best For**: Commercial products with budget for premium docs, especially API-heavy products.

**Setup Time**: ~15 minutes (with CLI)

**Example Command**:
```bash
npx mintlify init
mintlify dev
```

**Live Examples**:
- Anthropic: https://docs.anthropic.com/
- Clerk: https://clerk.com/docs
- Resend: https://resend.com/docs

---

### 6. GitBook

**By**: GitBook (Company)
**Tech**: Cloud-based, Markdown
**Hosting**: GitBook Cloud
**Website**: https://www.gitbook.com/

**Pros**:
- ✅ Beautiful, polished interface
- ✅ Collaborative editing
- ✅ Version control built-in
- ✅ No deployment needed
- ✅ Good for non-technical contributors
- ✅ Free tier available

**Cons**:
- ⚠️ **Paid for private docs** ($6.70/user/month)
- ⚠️ Vendor lock-in
- ⚠️ Less customizable
- ⚠️ Limited control over hosting

**Best For**: Teams wanting collaborative editing with minimal technical setup.

**Setup Time**: ~10 minutes (web-based)

**Live Examples**:
- Ethereum: https://ethereum.org/en/developers/docs/
- Kong: https://docs.konghq.com/

---

### 7. ReadTheDocs

**By**: ReadTheDocs (Non-profit)
**Tech**: Sphinx (Python), MkDocs
**Hosting**: ReadTheDocs Cloud (free for open source)
**Website**: https://readthedocs.org/

**Pros**:
- ✅ **Free for open source**
- ✅ Auto-builds from Git
- ✅ Version management
- ✅ Great for Python projects
- ✅ Established, reliable
- ✅ PDF/EPUB generation

**Cons**:
- ⚠️ Older, less modern design
- ⚠️ Sphinx can be complex
- ⚠️ Limited customization on free tier
- ⚠️ Ads on free tier (can be removed by request)

**Best For**: Open source Python projects.

**Setup Time**: ~30 minutes

**Live Examples**:
- Python: https://docs.python.org/
- Requests: https://requests.readthedocs.io/

---

### 8. Starlight (Astro)

**By**: Astro Team
**Tech**: Astro, Components
**Hosting**: Netlify, Vercel, GitHub Pages (free)
**Website**: https://starlight.astro.build/

**Pros**:
- ✅ Blazing fast (Astro)
- ✅ Component islands architecture
- ✅ Beautiful default theme
- ✅ Built-in search
- ✅ Multi-language support
- ✅ Free hosting

**Cons**:
- ⚠️ Very new (2023)
- ⚠️ Smaller ecosystem
- ⚠️ Less plugin support

**Best For**: Projects wanting cutting-edge performance with modern tooling.

**Setup Time**: ~20 minutes

**Example Command**:
```bash
npm create astro@latest -- --template starlight
```

**Live Examples**:
- Astro Docs: https://docs.astro.build/

---

## Detailed Comparison Table

| Feature | Docusaurus | VitePress | MkDocs Material | Nextra | Mintlify | GitBook | ReadTheDocs |
|---------|-----------|-----------|-----------------|--------|----------|---------|-------------|
| **Cost** | Free | Free | Free/Sponsor | Free | Paid | Paid | Free (OSS) |
| **Setup** | Medium | Easy | Medium | Medium | Easy | Easy | Hard |
| **Speed** | Good | Excellent | Good | Excellent | Excellent | Good | Good |
| **Search** | Excellent | Excellent | Excellent | Good | Excellent | Good | Good |
| **Customization** | High | Medium | High | High | Low | Low | Medium |
| **Versioning** | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| **Dark Mode** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| **Mobile** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Analytics** | Plugin | Plugin | Plugin | Plugin | Built-in | Built-in | Basic |
| **Hosting** | DIY | DIY | DIY | DIY | Managed | Managed | Managed |

---

## Recommendation by Use Case

### For Your Launcher Project

Based on the launcher being a Tauri (Rust) + React project, here are my top 3 recommendations:

#### 🥇 **Docusaurus** (Best Overall)

**Why**:
- Your launcher uses React, so Docusaurus fits naturally
- Excellent for technical documentation with code examples
- Free hosting on GitHub Pages or Netlify
- Mature, well-maintained, huge community

**Setup for Launcher Docs**:

```bash
# Create docs site
npx create-docusaurus@latest launcher-docs classic

# Directory structure
launcher-docs/
├── docs/
│   ├── intro.md
│   ├── getting-started.md
│   ├── configuration/
│   │   ├── tauri-config.md
│   │   ├── prerequisites.md
│   │   └── workmux.md
│   ├── guides/
│   │   ├── custom-project.md
│   │   └── building.md
│   └── troubleshooting.md
├── docusaurus.config.js
└── package.json

# Deploy to GitHub Pages
npm run deploy
```

**Cost**: $0 (free hosting on GitHub Pages)

#### 🥈 **VitePress** (Simplest)

**Why**:
- Fastest to set up
- Great performance
- Beautiful default theme
- Minimal maintenance

**Setup**:
```bash
npm init vitepress@latest launcher-docs
```

**Cost**: $0

#### 🥉 **Mintlify** (Premium Option)

**Why**:
- Stunning design out of the box
- Great for showcasing a commercial product
- AI-powered search
- Worth it if you plan to monetize the launcher

**Cost**: Free tier → $150/month (team plan)

---

## Recommended Approach

### Phase 1: Start Simple (Week 1)

Use **GitHub Pages** with simple Markdown:

```bash
# In your launcher repo
mkdir docs
echo "# Launcher Documentation" > docs/README.md
echo "theme: jekyll-theme-cayman" > docs/_config.yml

# Enable GitHub Pages in repo settings
# Docs will be available at: https://yourusername.github.io/launcher/
```

**Pros**: Zero setup, already in your repo
**Cons**: Basic styling, limited features

### Phase 2: Move to Docusaurus (When Ready)

Once you have more content, migrate to Docusaurus:

1. Create new `launcher-docs` repo
2. Set up Docusaurus
3. Copy Markdown files from `docs/` folder
4. Deploy to Netlify or Vercel
5. Custom domain (optional): `docs.yourlauncher.com`

### Phase 3: Premium (If Commercial)

If the launcher becomes a commercial product, consider Mintlify for:
- Professional appearance
- API documentation
- Customer analytics
- Premium support

---

## Free Hosting Options

All these support free hosting:

1. **GitHub Pages**
   - Best for open source
   - Custom domain support
   - HTTPS included
   - URL: `username.github.io/project`

2. **Netlify**
   - Excellent free tier
   - Continuous deployment
   - Form handling
   - URL: `project.netlify.app`

3. **Vercel**
   - Great for Next.js/React projects
   - Fast global CDN
   - Automatic previews
   - URL: `project.vercel.app`

4. **Cloudflare Pages**
   - Unlimited bandwidth
   - Fast CDN
   - Great for static sites
   - URL: `project.pages.dev`

---

## Example Documentation Structure

Regardless of platform, organize your docs like this:

```
docs/
├── index.md                       # Homepage
├── getting-started/
│   ├── installation.md           # Install launcher
│   ├── quick-start.md            # First worktree
│   └── concepts.md               # Core concepts
├── configuration/
│   ├── tauri-config.md           # App settings
│   ├── prerequisites.md          # Tool requirements
│   ├── workmux.md                # Worktree workflow
│   └── bundling.md               # Resource bundling
├── guides/
│   ├── custom-project.md         # Adapt for your project
│   ├── custom-commands.md        # Add Rust commands
│   ├── custom-ui.md              # Customize frontend
│   └── kanban-integration.md     # Optional Kanban
├── building/
│   ├── development.md            # Dev builds
│   ├── production.md             # Release builds
│   ├── code-signing.md           # Signing for distribution
│   └── ci-cd.md                  # Automated builds
├── troubleshooting/
│   ├── common-issues.md          # FAQ
│   ├── debugging.md              # Debug techniques
│   └── platform-specific.md      # OS-specific issues
└── api/
    ├── tauri-commands.md         # Rust commands reference
    └── config-schema.md          # YAML schema docs
```

---

## My Recommendation

**Start with Docusaurus**. Here's why:

1. ✅ **Free** - No hosting costs
2. ✅ **React-based** - Matches your tech stack
3. ✅ **Scalable** - Grows with your project
4. ✅ **Professional** - Used by major projects (React, Jest, Tauri)
5. ✅ **Great SEO** - Built-in optimization
6. ✅ **Versioning** - Document multiple launcher versions
7. ✅ **Search** - Algolia DocSearch (free for open source)

**Quick Start**:

```bash
# Create docs site
npx create-docusaurus@latest launcher-docs classic
cd launcher-docs

# Add your content
cp ../CUSTOM_PROJECT_GUIDE.md docs/configuration/custom-project.md

# Start dev server
npm start

# Build for production
npm run build

# Deploy to GitHub Pages
GIT_USER=yourusername npm run deploy
```

**Live in 30 minutes!**

---

## Additional Resources

- **Docusaurus Tutorial**: https://tutorial.docusaurus.io/
- **VitePress Guide**: https://vitepress.dev/guide/getting-started
- **MkDocs Material Setup**: https://squidfunk.github.io/mkdocs-material/getting-started/
- **Technical Writing Guide**: https://developers.google.com/tech-writing

---

## Next Steps

1. **Choose a platform** (I recommend Docusaurus)
2. **Set up basic structure** (~30 minutes)
3. **Copy CUSTOM_PROJECT_GUIDE.md** into docs
4. **Add screenshots** of the launcher
5. **Deploy** to free hosting
6. **Share** with early users for feedback
7. **Iterate** based on questions you receive

Good luck with your documentation site! 📚
