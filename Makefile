.PHONY: deploy destroy update

deploy update:
	@node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 26) { console.error("Node " + process.versions.node + " is too old. Run: nvm use"); process.exit(1) }'
	@test -n "$$SLACK_SIGNING_SECRET" || { echo "Set SLACK_SIGNING_SECRET. Copy it from the Slack app Basic Information page."; exit 1; }
	@test -n "$$SLACK_BOT_TOKEN" || { echo "Set SLACK_BOT_TOKEN. Copy the Bot User OAuth Token from OAuth & Permissions."; exit 1; }
	npm install
	npm run verify
	npm run deploy

destroy:
	@node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 26) { console.error("Node " + process.versions.node + " is too old. Run: nvm use"); process.exit(1) }'
	@test -n "$$SLACK_SIGNING_SECRET" || { echo "Set SLACK_SIGNING_SECRET. Copy it from the Slack app Basic Information page."; exit 1; }
	@test -n "$$SLACK_BOT_TOKEN" || { echo "Set SLACK_BOT_TOKEN. Copy the Bot User OAuth Token from OAuth & Permissions."; exit 1; }
	npm install
	npm run destroy
