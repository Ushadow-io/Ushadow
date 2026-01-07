# Ushadow Launcher Makefile

.PHONY: release release-test dev build build-debug clean version help

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
	@echo "  build         Build for current platform (release)"
	@echo "  build-debug   Build for current platform (debug)"
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
	npm run dev

# Build for current platform
build:
	npm run build

build-debug:
	npm run build:debug

# Version management
version:
	@./scripts/version.sh get

# Clean build artifacts
clean:
	rm -rf src-tauri/target/release/bundle
	rm -rf src-tauri/target/debug/bundle
	rm -rf releases/
	@echo "Build artifacts cleaned"
