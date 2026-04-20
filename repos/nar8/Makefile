# nar8 — Build & Deployment

APP_NAME ?= nar8

# Path to the standalone nar8 repo on this machine
STANDALONE_DEST ?= $(HOME)/repos/nar-8

.PHONY: sync

# Sync this export to the standalone repo, cleaning anything that no longer belongs
sync:
	@echo "Syncing repos/nar8 → $(STANDALONE_DEST) ..."
	@mkdir -p $(STANDALONE_DEST)
	rsync -av --delete \
		--exclude='.git' \
		--exclude='node_modules' \
		--exclude='.expo' \
		--exclude='ios' \
		--exclude='android' \
		--exclude='.pixi' \
		--exclude='build' \
		./ $(STANDALONE_DEST)/
	@echo "✅ Synced to $(STANDALONE_DEST)"

# Mobile build targets (env-setup, fastlane-beta, etc.)
# Run `make mobile-help` to see all mobile commands
-include Makefile.mobile
