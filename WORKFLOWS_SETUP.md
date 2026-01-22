# GitHub Actions Workflows Setup Guide

This guide covers the setup for three new automated workflows:

1. **Robot Framework Tests** - Automated test reports with GitHub Pages
2. **Mobile Builds** - Android APK & iOS IPA builds with automatic releases
3. **Jekyll Documentation** - Documentation site hosted on GitHub Pages

---

## 📋 Prerequisites

### For All Workflows:
- GitHub repository with Actions enabled
- Repository permissions: Settings → Actions → General → Workflow permissions → "Read and write permissions"

### For Mobile Builds:
- **EXPO_TOKEN** secret configured

---

## 🤖 1. Robot Framework Tests Workflow

**File:** `.github/workflows/robot-framework-tests.yml`

### What It Does:
- Runs Robot Framework tests on PR or manual trigger
- Publishes interactive HTML reports to GitHub Pages
- Posts test summary as PR comment
- Uploads test artifacts (HTML + XML reports)

### Features:
- ✅ Live test reports accessible via URL
- ✅ PR comments with pass/fail statistics
- ✅ Downloadable test artifacts
- ✅ Backend service startup automation
- ✅ Service log capture on failure

### Triggers:
- **Automatic:** PRs that modify `robot_tests/` or `ushadow/backend/`
- **Manual:** Actions tab → "Robot Framework Tests" → "Run workflow"

### Setup Steps:
No secrets required! Just enable GitHub Pages:

1. Go to **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Save

### Expected Output:
On PR:
```
## 🎉 Robot Framework Test Results

**Status**: ✅ All tests passed!

| Metric | Count |
|--------|-------|
| ✅ Passed | 15 |
| ❌ Failed | 0 |
| 📊 Total | 15 |

### 📊 View Reports
- [📋 Test Report](https://ushadow-io.github.io/Ushadow/report.html)
- [📝 Detailed Log](https://ushadow-io.github.io/Ushadow/log.html)
```

---

## 📱 2. Mobile Builds Workflow

**File:** `.github/workflows/mobile-builds.yml`
**EAS Config:** `ushadow/mobile/eas.json`

### What It Does:
- Builds Android APK and iOS IPA on push to main or manual trigger
- Creates GitHub Releases with downloadable binaries
- Automatic versioning with timestamps
- Supports building platforms independently

### Features:
- ✅ Android APK (ready to install)
- ✅ iOS IPA (simulator builds)
- ✅ Automatic GitHub Releases
- ✅ Manual trigger with platform selection
- ✅ Timestamped version tags

### Triggers:
- **Automatic:** Push to `main` branch when `ushadow/mobile/` changes
- **Manual:** Actions tab → "Build Mobile Apps" → Select platforms

### Setup Steps:

#### 1. Get Expo Token
1. Go to [expo.dev](https://expo.dev) and sign in
2. Navigate to [Access Tokens](https://expo.dev/accounts/[account]/settings/access-tokens)
3. Create new token → Copy it

#### 2. Add GitHub Secret
1. **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `EXPO_TOKEN`
4. Value: Paste your token
5. Save

#### 3. First Build
```bash
# Test locally first
cd ushadow/mobile
npm install
eas init --force --non-interactive
eas build --platform android --profile local --local
```

### Expected Output:
Creates GitHub Release with:
- `ushadow-mobile-android.apk` (Android)
- `ushadow-mobile-ios.ipa` (iOS simulator)
- Installation instructions
- Build metadata

**Release Tag Format:** `mobile-v1.0.0-20260122-143052`

---

## 📚 3. Jekyll Documentation Workflow

**File:** `.github/workflows/jekyll-docs.yml`

### What It Does:
- Converts your `docs/` folder into a beautiful documentation website
- Automatically creates Jekyll config if missing
- Deploys to GitHub Pages on every push to main
- Supports Markdown with syntax highlighting

### Features:
- ✅ Automatic Jekyll setup
- ✅ Clean documentation theme (Minima)
- ✅ Markdown support with code highlighting
- ✅ SEO optimization
- ✅ Sitemap generation

### Triggers:
- **Automatic:** Push to `main` branch when `docs/` changes
- **Manual:** Actions tab → "Deploy Jekyll Documentation" → "Run workflow"

### Setup Steps:

1. **Enable GitHub Pages:**
   - **Settings** → **Pages**
   - Source: **GitHub Actions**
   - Save

2. **Optional - Customize Jekyll:**
   ```bash
   cd docs

   # Create custom Gemfile (optional)
   cat > Gemfile << 'EOF'
   source "https://rubygems.org"
   gem "jekyll", "~> 4.3"
   gem "minima", "~> 2.5"
   EOF

   # Create custom _config.yml (optional)
   cat > _config.yml << 'EOF'
   title: Your Custom Title
   description: Your description
   theme: minima
   EOF
   ```

3. **Add index page:**
   ```bash
   cd docs
   cat > index.md << 'EOF'
   ---
   layout: home
   title: Home
   ---

   # Welcome to Ushadow Documentation

   Your documentation content here...
   EOF
   ```

### Expected Output:
Documentation site available at:
```
https://ushadow-io.github.io/Ushadow/
```

---

## 🚀 Quick Start

### Test Everything:

```bash
# 1. Commit the new workflows
git add .github/workflows/*.yml ushadow/mobile/eas.json
git commit -m "feat: add CI/CD workflows for tests, mobile, and docs"
git push

# 2. Configure secrets
# Go to Settings → Secrets and variables → Actions
# Add: EXPO_TOKEN

# 3. Enable GitHub Pages
# Settings → Pages → Source: GitHub Actions

# 4. Test each workflow manually:
# Actions tab → Select workflow → Run workflow
```

---

## 🔍 Viewing Results

### Robot Tests:
- **Live Reports:** Check PR comment for URLs
- **Artifacts:** Actions run → Scroll to "Artifacts" → Download ZIP
- **Logs:** Actions run → "Run Robot Framework tests" step

### Mobile Builds:
- **Releases:** Repository → Releases tab
- **Download:** Click on APK/IPA file
- **Logs:** Actions run → Build steps

### Jekyll Docs:
- **Live Site:** Settings → Pages → "Visit site" button
- **Build Status:** Actions tab → "Deploy Jekyll Documentation"

---

## 🐛 Troubleshooting

### Robot Tests Not Running:
```bash
# Check if paths are correct
git diff --name-only origin/main | grep -E "robot_tests|ushadow/backend"

# Manually trigger
# Actions → Robot Framework Tests → Run workflow
```

### Mobile Build Fails:
```bash
# Common issues:
# 1. EXPO_TOKEN not set or expired
# 2. EAS not initialized (run: eas init)
# 3. Node modules outdated (run: npm ci)

# Debug locally:
cd ushadow/mobile
npm ci
eas build --platform android --profile local --local
```

### Jekyll Build Fails:
```bash
# Common issues:
# 1. Invalid Markdown syntax
# 2. Missing front matter (add --- at top of files)
# 3. Jekyll config errors

# Test locally:
cd docs
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

---

## 📊 Workflow Status

Check workflow runs:
```
Repository → Actions tab
```

View workflow details:
```
Actions → Select workflow → Click on a run
```

---

## 🔗 Useful Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Robot Framework](https://robotframework.org/)
- [Jekyll Documentation](https://jekyllrb.com/docs/)
- [GitHub Pages](https://pages.github.com/)

---

## 💡 Next Steps

1. **Add Claude Code Integration** - Automated code reviews on PRs
2. **Add Docker Build Workflow** - Build and push container images
3. **Add Deployment Workflows** - Auto-deploy to staging/production

See the `workflows/` folder for additional workflow templates from your other project!
