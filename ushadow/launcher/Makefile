# Ushadow Launcher Makefile

.PHONY: release release-test dev build build-debug build-dmg clean version help test-fresh test-fresh-dev reset-data

# Default target
help:
	@echo "Ushadow Launcher"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  release       Interactive release workflow (prompts for version, platforms)"
	@echo "  release-test  Test release workflow (auto-build current platform, non-interactive)"
	@echo "  dev           Start development server"
	@echo "  build         Build frontend only (vite build)"
	@echo "  build-dmg     Build complete macOS DMG installer"
	@echo "  build-debug   Build DMG in debug mode (faster, for testing)"
	@echo "  test-fresh    Reset data & launch INSTALLED app (tests DMG)"
	@echo "  test-fresh-dev Reset data & launch DEV build (tests local changes)"
	@echo "  reset-data    Clear all persisted state (localStorage, settings)"
	@echo "  version       Show current version"
	@echo "  clean         Clean build artifacts"
	@echo "  help          Show this help"

# Interactive release - the main workflow
release:
	@./scripts/interactive-release.sh

# Test release - auto-build without prompts
release-test:
	@echo "🧪 Test Release Mode"
	@echo "Building for current platform only..."
	@VERSION=$$(./scripts/version.sh get) && \
	OS=$$(uname -s | tr '[:upper:]' '[:lower:]') && \
	PLATFORM=$$(if [ "$$OS" = "darwin" ]; then echo "macos"; else echo "$$OS"; fi) && \
	echo "Version: $$VERSION" && \
	echo "Platform: $$PLATFORM" && \
	gh workflow run launcher-release.yml \
		--ref main \
		-f version="$$VERSION" \
		-f platforms="$$PLATFORM" \
		-f draft=true \
		-f release_name="Test Build - $$PLATFORM" && \
	echo "✓ Workflow dispatched! Check: https://github.com/$$(git remote get-url origin | sed 's/.*://;s/.git//')/actions"

# Development
dev:
	npm run tauri:dev

# Build frontend only (for quick iterations)
build:
	npm run build

# Build complete macOS DMG installer (production)
build-dmg:
	@echo "🔨 Building Ushadow Launcher DMG..."
	@echo "This will take 2-5 minutes..."
	@echo ""
	@echo "Cleaning previous DMG artifacts..."
	@rm -rf src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true
	@echo "Building..."
	npm run tauri:build
	@echo ""
	@echo "✅ Build complete!"
	@echo "📦 DMG location: src-tauri/target/release/bundle/dmg/"
	@ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || echo "No DMG found - check for errors above"

# Build DMG in debug mode (faster, for testing)
build-debug:
	@echo "🔨 Building debug DMG (faster, larger file)..."
	npm run tauri:build:debug
	@echo ""
	@echo "✅ Debug build complete!"
	@echo "📦 DMG location: src-tauri/target/debug/bundle/dmg/"
	@ls -lh src-tauri/target/debug/bundle/dmg/*.dmg 2>/dev/null || echo "No DMG found - check for errors above"

# Version management
version:
	@./scripts/version.sh get

# Clean build artifacts
clean:
	rm -rf src-tauri/target/release/bundle
	rm -rf src-tauri/target/debug/bundle
	rm -rf releases/
	@echo "Build artifacts cleaned"

# Reset user data (test as fresh user)
reset-data:
	@./reset-user-data.sh

# Test installed app as fresh user (reset + launch DMG)
test-fresh: reset-data
	@echo "Launching INSTALLED app as fresh user..."
	@echo "(This tests the DMG you installed, not local dev changes)"
	@sleep 1
	@open -a Ushadow 2>/dev/null || echo "App not installed - build DMG first with 'make build-dmg'"

# Test dev build as fresh user (reset + launch dev)
test-fresh-dev: reset-data
	@echo "Launching DEV BUILD as fresh user..."
	@echo "(This tests your local code changes)"
	@sleep 1
	npm run tauri:dev
