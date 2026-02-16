.PHONY: help build-ios build-ios-preview submit-testflight build-and-submit build-list install clean

# Default target
help:
	@echo "ushadow Mobile - EAS Build Commands"
	@echo ""
	@echo "Available targets:"
	@echo "  make build-ios           - Build production iOS app for TestFlight/App Store"
	@echo "  make build-ios-preview   - Build preview iOS app for internal testing (requires UDID)"
	@echo "  make submit-testflight   - Submit latest build to TestFlight"
	@echo "  make build-and-submit    - Build and auto-submit to TestFlight in one step"
	@echo "  make build-list          - List all EAS builds"
	@echo "  make install             - Install dependencies"
	@echo "  make clean               - Clean build artifacts"
	@echo ""
	@echo "Quick start:"
	@echo "  make build-and-submit    # Build and submit to TestFlight"

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
