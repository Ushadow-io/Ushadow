# @ushadow/mobile-build

Shared build & deployment automation for Expo mobile apps in the Ushadow monorepo.

## What's included

| File | Purpose |
|------|---------|
| `fastlane/SharedFastfile` | Parameterized Fastlane lanes (beta, build, submit, bump_build) |
| `Makefile.include` | Shared Make targets any app can include |
| `Gemfile` | Ruby dependencies (Fastlane, CocoaPods) |

## Quick start (new app)

### 1. Create `build.json` in your app root

```json
{
  "scheme": "myapp",
  "app_identifier": "io.myapp.mobile",
  "extensions": {
    "io.myapp.mobile.widget": "RecordingWidget"
  }
}
```

### 2. Create `fastlane/Fastfile`

```ruby
import "../../packages/mobile-build/fastlane/SharedFastfile"
```

### 3. Create `fastlane/Appfile`

```ruby
require 'json'
build_config = JSON.parse(File.read(File.join(File.dirname(__FILE__), '..', 'build.json')))
eas_config   = JSON.parse(File.read(File.join(File.dirname(__FILE__), '..', 'eas.json')))
eas_submit   = eas_config.dig('submit', 'production', 'ios') || {}

app_identifier(build_config['app_identifier'])
apple_id(ENV['FASTLANE_APPLE_ID'] || eas_submit['appleId'] || '')
team_id(eas_submit['appleTeamId'] || '')
itc_team_id(eas_submit['appleTeamId'] || '')
```

### 4. Create `Gemfile`

```ruby
source "https://rubygems.org"
eval_gemfile File.join(__dir__, '..', '..', 'packages', 'mobile-build', 'Gemfile')
```

### 5. Create `Makefile`

```makefile
# App-specific variables (optional overrides)
APP_NAME ?= myapp

# Include shared build targets
include ../../packages/mobile-build/Makefile.include
```

### 6. Create `eas.json` with your app's credentials

See `ushadow/mobile/eas.json` for an example.

## Make targets

```
make help                  Show all available targets
make fastlane-beta         Build + TestFlight (fastest, 5-10 min)
make fastlane-build        Build only
make fastlane-submit       Submit existing IPA
make fastlane-setup        Install Fastlane + deps
make env-setup             Configure Apple ID credentials
make build-ios             EAS cloud build (production)
make build-ios-preview     EAS cloud build (preview/internal)
make build-and-submit      EAS build + auto-submit
make build-ios-local       EAS local build
make clean                 Clean build artifacts
```

## Environment variables

Set in `.env.local` (created by `make env-setup`):

| Variable | Description |
|----------|-------------|
| `FASTLANE_APPLE_ID` | Apple ID email |
| `APP_STORE_CONNECT_API_KEY_KEY_ID` | ASC API key ID |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | ASC API issuer ID |
| `APP_STORE_CONNECT_API_KEY_KEY_FILEPATH` | Path to .p8 key file |
