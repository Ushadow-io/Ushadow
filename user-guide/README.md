# uShadow Launcher Documentation

This is the documentation site for the uShadow Launcher, built with [Docusaurus](https://docusaurus.io/).

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# This will open http://localhost:3000
```

## Building

```bash
# Build static site
npm run build

# The output will be in the `build/` directory
```

## Deployment

### GitHub Pages

```bash
# Deploy to GitHub Pages
npm run deploy
```

Before deploying, update these fields in `docusaurus.config.js`:
- `url`: Your GitHub Pages URL (e.g., `https://username.github.io`)
- `baseUrl`: Your project path (e.g., `/ushadow-launcher/`)
- `organizationName`: Your GitHub username or org
- `projectName`: Your repository name

### Other Platforms

The `build/` directory contains a static site that can be deployed to:
- **Netlify**: Drop the `build/` folder or connect to GitHub
- **Vercel**: Import the repository and set build command to `npm run build`
- **AWS S3**: Upload the `build/` directory to S3 bucket with static hosting
- **Cloudflare Pages**: Connect to GitHub and deploy

## Documentation Structure

```
docs/
├── intro.md                    # Landing page
├── getting-started/            # Installation and setup
├── concepts/                   # Core concepts (worktrees, environments)
├── guides/                     # Feature guides (tmux, kanban, etc.)
├── development/                # Developer docs (testing, releasing)
├── changelog.md                # Version history
└── roadmap.md                  # Future plans
```

## Updating Documentation

1. Edit markdown files in `docs/`
2. The dev server will hot-reload changes
3. Update `sidebars.js` if adding new sections
4. Commit and push changes

## Customization

- **Logo**: Replace `static/img/logo.svg`
- **Favicon**: Replace `static/img/favicon.ico`
- **Colors**: Edit `src/css/custom.css`
- **Config**: Edit `docusaurus.config.js`

## TypeScript Support

This project has TypeScript support enabled. You can use `.tsx` files in `src/` for custom React components.

## Tips

- Use `:::note`, `:::tip`, `:::info`, `:::caution`, `:::danger` for callouts
- Use code blocks with syntax highlighting: \`\`\`typescript
- Add frontmatter to control sidebar position and titles
- Use MDX for interactive components in docs
