.PHONY: help build-ios build-ios-preview submit-testflight build-and-submit build-list install clean build-ios-local build-local-and-submit fastlane-setup fastlane-beta fastlane-build fastlane-submit env-setup

# Load environment variables from .env.local if it exists
ifneq (,$(wildcard .env.local))
    include .env.local
    export
endif

# Default target
help:
	@echo "ushadow Mobile - Build & Deployment Commands"
	@echo ""
	@echo "🚀 Fastlane (FASTEST - recommended! from ushadow-sdk):"
	@echo "  make env-setup           - Configure Apple ID and credentials (.env.local)"
	@echo "  make fastlane-setup      - Install Fastlane and dependencies"
	@echo "  make fastlane-beta       - Build and upload to TestFlight (5-10 min, no queues!)"
	@echo "  make fastlane-build      - Build iOS app only"
	@echo "  make fastlane-submit     - Submit existing build to TestFlight"
	@echo ""
	@echo "Cloud Builds (slower, uses EAS builders):"
	@echo "  make build-ios           - Build production iOS app for TestFlight/App Store"
	@echo "  make build-ios-preview   - Build preview iOS app for internal testing (requires UDID)"
	@echo "  make build-and-submit    - Build and auto-submit to TestFlight in one step"
	@echo ""
	@echo "Local Builds (faster compile, slower upload):"
	@echo "  make build-ios-local     - Build iOS locally (no EAS queue wait)"
	@echo "  make build-local-and-submit - Build locally and submit to TestFlight"
	@echo ""
	@echo "Submit & Manage:"
	@echo "  make submit-testflight   - Submit latest build to TestFlight"
	@echo "  make build-list          - List all EAS builds"
	@echo ""
	@echo "Development:"
	@echo "  make install             - Install dependencies"
	@echo "  make clean               - Clean build artifacts"
	@echo ""
	@echo "⚡ Quick start:"
	@echo "  make env-setup           # Configure Apple ID (first time only)"
	@echo "  make fastlane-setup      # Install Fastlane (first time only)"
	@echo "  make fastlane-beta       # Deploy to TestFlight (fastest!)"

# Build production iOS (for TestFlight/App Store)
build-ios:
	@echo "Building iOS production build..."
	eas build --platform ios --profile production

# Build preview iOS (internal distribution)
build-ios-preview:
	@echo "Building iOS preview build for device testing..."
	eas build --platform ios --profile preview

# Submit to TestFlight
submit-testflight:
	@echo "Submitting latest build to TestFlight..."
	eas submit --platform ios --latest

# Build and auto-submit to TestFlight
build-and-submit:
	@echo "Building and submitting to TestFlight..."
	eas build --platform ios --profile production --auto-submit

# Build iOS locally (no EAS queue, runs on your Mac)
build-ios-local:
	@echo "Building iOS production build locally..."
	@echo "⚠️  This requires Xcode and valid code signing credentials"
	eas build --platform ios --profile production --local

# Build locally and submit to TestFlight
build-local-and-submit:
	@echo "Building iOS locally and submitting to TestFlight..."
	@echo "⚠️  This requires Xcode and valid code signing credentials"
	@echo ""
	@echo "Step 1: Building locally..."
	eas build --platform ios --profile production --local
	@echo ""
	@echo "Step 2: Submitting to TestFlight..."
	eas submit --platform ios --latest

# List all builds
build-list:
	@echo "Listing all EAS builds..."
	eas build:list

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm install

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf node_modules/.cache
	rm -rf .expo

# Build iOS locally (no EAS queue, runs on your Mac)
build-ios-local:
	@echo "Building iOS production build locally..."
	@echo "⚠️  This requires Xcode and valid code signing credentials"
	eas build --platform ios --profile production --local

# Build locally and submit to TestFlight with progress indicators
build-local-and-submit:
	@echo "════════════════════════════════════════════════════════════"
	@echo "Building iOS locally and submitting to TestFlight"
	@echo "════════════════════════════════════════════════════════════"
	@echo "⚠️  Requirements:"
	@echo "   - Xcode and valid code signing credentials"
	@echo "   - Good internet upload speed (recommended: >10 Mbps)"
	@echo ""
	@echo "📋 Process Overview:"
	@echo "   1. Build .ipa locally (5-15 min) - uses your Mac's CPU"
	@echo "   2. Upload to EAS servers (10-30 min) - depends on upload speed"
	@echo "   3. Submit to App Store Connect (1-2 min)"
	@echo "   4. Apple processing (5-10 min)"
	@echo ""
	@echo "⏱️  Total time: ~20-60 minutes"
	@echo "════════════════════════════════════════════════════════════"
	@echo ""
	@echo "▶️  Step 1/2: Building locally..."
	@echo ""
	eas build --platform ios --profile production --local
	@echo ""
	@echo "✅ Build complete!"
	@echo ""
	@echo "════════════════════════════════════════════════════════════"
	@echo "▶️  Step 2/2: Uploading to TestFlight..."
	@echo "════════════════════════════════════════════════════════════"
	@echo "⚠️  This step uploads the .ipa to EAS servers then to Apple"
	@echo "📤 Upload speed matters here - typical .ipa is 50-200MB"
	@echo ""
	@echo "💡 Tip: Check upload progress in another terminal:"
	@echo "   sudo lsof -i -P | grep eas-cli"
	@echo ""
	@echo "🕐 Starting upload (this may take 10-30 minutes)..."
	@echo ""
	eas submit --platform ios --latest
	@echo ""
	@echo "════════════════════════════════════════════════════════════"
	@echo "✅ Upload complete!"
	@echo "════════════════════════════════════════════════════════════"
	@echo "📱 Next steps:"
	@echo "   - Apple will process your build (~5-10 minutes)"
	@echo "   - Check TestFlight in App Store Connect"
	@echo "   - Build will appear in TestFlight app soon"
	@echo "════════════════════════════════════════════════════════════"

# ========================================
# Fastlane Targets (Fastest Deployment!)
# ========================================

# Setup environment variables for Fastlane
env-setup:
	@echo "════════════════════════════════════════════════════════════"
	@echo "Configure Fastlane Environment Variables"
	@echo "════════════════════════════════════════════════════════════"
	@if [ -f .env.local ]; then \
		echo "⚠️  .env.local already exists!"; \
		echo ""; \
		echo "Current configuration:"; \
		grep -E "^FASTLANE_APPLE_ID=" .env.local || echo "  FASTLANE_APPLE_ID: (not set)"; \
		echo ""; \
		read -p "Do you want to reconfigure? (y/N): " confirm; \
		if [ "$$confirm" != "y" ] && [ "$$confirm" != "Y" ]; then \
			echo "Keeping existing configuration."; \
			exit 0; \
		fi; \
	fi
	@echo ""
	@echo "Please enter your Apple ID (email for App Store Connect):"
	@read -p "Apple ID: " apple_id; \
	if [ -z "$$apple_id" ]; then \
		echo "❌ Apple ID cannot be empty"; \
		exit 1; \
	fi; \
	echo "# Fastlane Environment Variables" > .env.local; \
	echo "# Generated by: make env-setup" >> .env.local; \
	echo "" >> .env.local; \
	echo "# Your Apple ID (email address used for App Store Connect)" >> .env.local; \
	echo "FASTLANE_APPLE_ID=$$apple_id" >> .env.local; \
	echo "" >> .env.local; \
	echo "# Skip waiting for build processing (faster deployments)" >> .env.local; \
	echo "FASTLANE_SKIP_WAITING_FOR_BUILD_PROCESSING=true" >> .env.local; \
	echo "" >> .env.local; \
	echo "# Disable analytics" >> .env.local; \
	echo "FASTLANE_OPT_OUT_USAGE=1" >> .env.local; \
	echo ""; \
	echo "✅ Configuration saved to .env.local"; \
	echo ""; \
	echo "Apple ID: $$apple_id"; \
	echo ""; \
	echo "════════════════════════════════════════════════════════════"; \
	echo "Next steps:"; \
	echo "  1. Run: make fastlane-setup (if you haven't already)"; \
	echo "  2. Run: make fastlane-beta"; \
	echo "════════════════════════════════════════════════════════════"

# Setup Fastlane and dependencies (delegates to ushadow-sdk)
fastlane-setup:
	@bash ../../mycelia/myceliasdk/scripts/fastlane-setup.sh

# Build and upload to TestFlight using Fastlane (FASTEST!)
fastlane-beta:
	@bash ../../mycelia/myceliasdk/scripts/fastlane-beta.sh

# Build iOS app using Fastlane (no upload)
fastlane-build:
	@bash ../../mycelia/myceliasdk/scripts/fastlane-build.sh

# Submit existing build to TestFlight using Fastlane
fastlane-submit:
	@bash ../../mycelia/myceliasdk/scripts/fastlane-submit.sh
