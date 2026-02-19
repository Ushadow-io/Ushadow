# Fastlane Setup Guide

This guide will help you set up Fastlane for iOS deployment automation.

## Why Fastlane?

**Fastlane is 3-5x faster than EAS submission:**

| Method | Build Time | Upload Time | Queue Time | Total |
|--------|------------|-------------|------------|-------|
| EAS Submit | 5-15 min | 10-30 min | 10-20 min | **25-65 min** |
| Fastlane | 5-15 min | 2-5 min | 0 min | **7-20 min** |

✅ **No queues** - Direct upload to Apple
✅ **No EAS servers** - Bypasses Expo infrastructure
✅ **Industry standard** - Used by Uber, Twitter, Spotify
✅ **Free forever** - Open source, runs locally

---

## Prerequisites

- ✅ macOS with Xcode installed
- ✅ Valid Apple Developer account
- ✅ App already created in App Store Connect
- ✅ Valid code signing credentials

---

## Quick Start (5 minutes)

### Step 1: Install Fastlane

```bash
cd /Users/stu/repos/worktrees/ushadow/orange/ushadow/mobile

# Install Fastlane and dependencies
make fastlane-setup
```

This will:
- Install bundler (if not already installed)
- Install Fastlane gem
- Install all dependencies

### Step 2: Set Apple ID (Optional)

```bash
# Add to your ~/.zshrc or ~/.bashrc
export FASTLANE_APPLE_ID="your-apple-id@example.com"

# Or set it for this session only
export FASTLANE_APPLE_ID="your-apple-id@example.com"
```

### Step 3: Deploy to TestFlight

```bash
# Build and upload to TestFlight (5-10 minutes!)
make fastlane-beta
```

That's it! Your app will be in TestFlight in ~5-10 minutes.

---

## Available Commands

### Main Commands

```bash
# Deploy to TestFlight (fastest!)
make fastlane-beta

# Build only (no upload)
make fastlane-build

# Submit existing build
make fastlane-submit
```

### Direct Fastlane Commands

```bash
# View all available lanes
bundle exec fastlane lanes

# Run specific lane
bundle exec fastlane beta
bundle exec fastlane build
bundle exec fastlane submit

# Increment build number only
bundle exec fastlane bump_build
```

---

## First-Time Setup Details

### 1. Apple ID Authentication

When you run `make fastlane-beta` for the first time, Fastlane will ask for:

**Option A: Apple ID + Password**
```
Apple ID: your-apple-id@example.com
Password: [your password]
```

**Option B: App Store Connect API Key (Recommended for CI/CD)**

You're already using API Key with EAS (Key ID: H96BWR4X7Q), so Fastlane should automatically use it!

### 2. Code Signing

Fastlane will use Xcode's automatic code signing by default.

If you see code signing errors:
```bash
# Open Xcode and ensure code signing is configured
open ios/ushadow.xcworkspace

# Go to: Project Settings → Signing & Capabilities
# Ensure "Automatically manage signing" is checked
```

### 3. Two-Factor Authentication (2FA)

If you have 2FA enabled (you should!), Fastlane will prompt you:
```
Please enter the 6 digit code:
```

Enter the code from your phone. Fastlane will save a session token for ~30 days.

---

## Troubleshooting

### "Command not found: bundle"

Install Ruby bundler:
```bash
gem install bundler
```

### "Could not find gem 'fastlane'"

Run the setup again:
```bash
make fastlane-setup
```

### "No provisioning profile found"

Open Xcode and refresh provisioning profiles:
```bash
open ios/ushadow.xcworkspace

# Xcode → Settings → Accounts → Download Manual Profiles
```

### "IPA export failed"

Check your code signing configuration:
1. Open `ios/ushadow.xcworkspace`
2. Select project → Target "ushadow"
3. Go to "Signing & Capabilities"
4. Ensure Team is set to "6SJ7NH4HSZ"
5. Ensure "Automatically manage signing" is enabled

### Build succeeds but upload fails

Check App Store Connect API key:
```bash
# The API key should be automatically detected from EAS configuration
# But you can also set it manually in fastlane/Appfile
```

---

## Configuration Files

### `Gemfile`
Ruby dependencies (Fastlane version)

### `fastlane/Appfile`
App identifier, team ID, Apple ID configuration

### `fastlane/Fastfile`
Build lanes and automation scripts

### Key Settings in `Fastfile`

```ruby
SCHEME = "ushadow"                           # Your app scheme
WORKSPACE = "./ios/ushadow.xcworkspace"      # Xcode workspace
PROJECT = "./ios/ushadow.xcodeproj"          # Xcode project
```

---

## Customization

### Add Slack Notifications

```ruby
# In fastlane/Fastfile, after upload_to_testflight:
slack(
  message: "New build uploaded to TestFlight!",
  webhook_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
)
```

### Change Export Method

```ruby
# In build_app lane, change export_method:
export_method: "enterprise"  # For enterprise distribution
export_method: "ad-hoc"      # For ad-hoc distribution
export_method: "development" # For development builds
```

### Auto-distribute to External Testers

```ruby
# In fastlane/Fastfile, beta lane:
upload_to_testflight(
  distribute_external: true,      # Enable external distribution
  notify_external_testers: true,  # Send email notification
  groups: ["Beta Testers"],       # TestFlight group name
  changelog: "What's new in this build"
)
```

---

## Comparison: EAS vs Fastlane

### EAS Submit (Current)
```bash
make build-local-and-submit
├─ Build locally (5-15 min)
├─ Upload .ipa to EAS servers (10-30 min) ← SLOW
├─ Wait in EAS submission queue (10-20 min) ← SLOW
└─ EAS submits to Apple (1-2 min)
Total: 26-67 minutes
```

### Fastlane (New)
```bash
make fastlane-beta
├─ Build locally (5-15 min)
├─ Upload directly to Apple (2-5 min) ← FAST
└─ No queue!
Total: 7-20 minutes
```

**Fastlane is 3-4x faster! 🚀**

---

## Advanced Usage

### CI/CD Integration

Fastlane works great with GitHub Actions, CircleCI, etc:

```yaml
# .github/workflows/deploy.yml
- name: Deploy to TestFlight
  run: bundle exec fastlane beta
  env:
    FASTLANE_APPLE_ID: ${{ secrets.APPLE_ID }}
    FASTLANE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
```

### Match for Code Signing

For team environments, use Fastlane Match:

```bash
# Setup match (one-time)
bundle exec fastlane match init

# Get certificates
bundle exec fastlane match appstore
```

---

## Support

- 📚 [Fastlane Docs](https://docs.fastlane.tools/)
- 💬 [Fastlane Community](https://github.com/fastlane/fastlane/discussions)
- 🐛 [Report Issues](https://github.com/fastlane/fastlane/issues)

---

## Next Steps

1. ✅ Run `make fastlane-setup` (one-time)
2. ✅ Run `make fastlane-beta` (deploy!)
3. ✅ Enjoy 3-4x faster deployments! 🎉

No more waiting in EAS queues! 🚀
