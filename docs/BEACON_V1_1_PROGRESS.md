# Beacon v1.1 — Implementation progress and release gates

**Status:** In development on `main`. The deployed/public version remains 1.0.0 until release checks are complete.

## Completed in this iteration

- [x] Make event module loading platform-safe: use `pathToFileURL` for paths with spaces and special characters.
- [x] Add regression coverage for event module URL construction.
- [x] Refactor basic AutoMod spam history to expire inactive users and bound each user's retained message window.
- [x] Add regression coverage for repeated messages, rapid messages, excessive mentions, per-server isolation, stale cleanup, and sliding windows.
- [x] Reuse the same guild configuration read within guild message processing instead of reading it twice for AutoMod and prefix commands.
- [x] Stop logging full guild message bodies and raw prefix-command arguments.
- [x] Use the central configured primary-owner ID for system-health and restart notifications.
- [x] Preserve the separate new-server owner DM and developer guild-join DM from the previous iteration.

## Release blockers — do not call v1.1 complete yet

- [ ] **Dependency security audit:** Current npm audit flags high-severity vulnerabilities in `body-parser` (GHSA-27r3-jxmh-p828) and `zod` (GHSA-mrhx-c7xc-m3w5). The latter needs a planned Zod v3-to-v4 migration: schemas currently use `z.record(valueSchema)`, which has changed in v4. Regenerate and commit `package-lock.json` alongside any dependency changes; do not use `npm audit fix --force` on production without validating data and schema compatibility.
- [ ] Full `npm run preflight`, `npm audit --omit=dev --audit-level=high`, Docker build, migration checks and fresh production deployment.
- [ ] Two live Discord server smoke tests (including a server with incomplete permissions), plus tickets, welcome roles, AutoMod, prefix/slash commands and owner notification.
- [ ] Review dashboard, moderation/anti-nuke, ticket reopen/claim, rate limiting, reaction roles and music for regression and concurrency edge cases.
- [ ] Review operator-facing upgrade/restart instructions and announce a maintenance window if a schema migration is required.
- [ ] Explicitly approve and plan any new or paid features; do not remove free moderation/security tools.
- [ ] Set `package.json` to v1.1.0 and publish release notes **only when the gates above pass**.

## Next recommended development work

1. **Security / reliability:** Fix and verify dependency advisories, test PostgreSQL migration and degraded-mode recovery; test restart-watchdog behaviour on the actual host.
2. **Core diagnostics:** Implement the existing planned read-only `/diagnose` command, with per-feature missing permission checks and private output; do not register it before acceptance tests.
3. **Support operations:** Add `/ticketstats` from the command ideas, showing completed/claimed tickets without exposing transcripts or staff private notes.
4. **Moderator safety:** Add read-only `/roleaudit`, reusing the anti-nuke dangerous-permission list, and exercise emergency lockdown recovery in a test guild.
5. **User experience:** Audit dashboard menus, stale component errors, loading/timeout messages, embed consistency, help pagination and music error messages.

## Existing command design notes

See `docs/BEACON_V1_1_NEW_COMMANDS_PLAN.md` and `docs/BEACON_V1_1_COMMAND_IDEAS.md` for overlap analysis. Do not duplicate existing slash commands.

**Branch policy:** All current v1.1 work is made on `main`; the legacy `v1.1-dev` branch is not used. GitHub's branch settings can delete it manually when convenient.
