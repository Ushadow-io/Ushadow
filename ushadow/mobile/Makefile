.PHONY: help build-ios build-ios-preview submit-testflight build-and-submit build-list install clean build-ios-local build-local-and-submit

# Default target
help:
	@echo "ushadow Mobile - EAS Build Commands"
	@echo ""
	@echo "Cloud Builds (slower, uses EAS builders):"
	@echo "  make build-ios           - Build production iOS app for TestFlight/App Store"
	@echo "  make build-ios-preview   - Build preview iOS app for internal testing (requires UDID)"
	@echo "  make build-and-submit    - Build and auto-submit to TestFlight in one step"
	@echo ""
	@echo "Local Builds (faster, builds on your Mac):"
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
	@echo "Quick start:"
	@echo "  make build-local-and-submit  # Fastest - build locally + submit"

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
