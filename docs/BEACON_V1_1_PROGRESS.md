# Beacon v1.1 — Implementation progress and release gates

**Status:** In development on `main`. The deployed/public version remains 1.0.0 until release checks are complete.

## 25 October 2026 — Stabilization before release

Beacon's official motto is **Your community's all-in-one Discord assistant.** Progression is a flagship module, not the bot's entire identity.

**Completed in code (still requires live Discord smoke tests):**
- Daily and weekly quests now persist immediately when panels first open after UTC rollover, including archived quest results.
- PostgreSQL advisory-lock concurrency now reserves connection headroom, handles queue handoff and refuses unsafe single-connection configurations.
- Quest-reroll buttons acknowledge early and preserve existing dashboard controls on transient refresh errors.
- Global leaderboard now uses bounded parallel database reads with stable ordering for tied XP.
- Ticket permission checks cancel unneeded timeout timers.
- PostgreSQL cleanup deletes only snapshots with Beacon-owned managed filenames, not arbitrary old .dump files. New snapshots use beacon-backup names; legacy diddybot9000-backup snapshots remain recognised.
- Regression tests now cover rollover writes, refused saves, burst lock contention, ranking stability and backup cleanup safety.

**Must-pass release blockers:**
- [ ] Test two independent real Discord servers, one intentionally missing permissions. Cover dashboard, reaction roles, ticket information/transcripts/deletion, moderation, quest rerolls and rank cards.
- [ ] Restart the deployed bot; verify XP, founder registry, weekly rewards, tickets and reroll limits in the actual PostgreSQL database.
- [ ] Take an off-host backup, perform a real restore drill and retain recovery instructions. A green CI job alone does not validate production disaster recovery.
- [ ] Confirm gateway intents, slash command registration, timeout handling, audit log privacy and permission denial messages.
- [ ] Approve operator rollback and v1.1.0 release notes. Do not bump package.json version or announce a final release prematurely.

**Small additions worth considering before launch:**
1. One-page setup guide and first-time onboarding walkthrough.
2. Easy support/bug report channel with reproducible issue details.
3. Opt-in privacy-conscious onboarding metrics (install, first configuration, first completed quest, returning guild).
4. Clear release changelog with real screenshots. Postpone leagues, seasons and paid feature gates.
## Completed in this iteration

- [x] Make event module loading platform-safe: use `pathToFileURL` for paths with spaces and special characters.
- [x] Add regression coverage for event module URL construction.
- [x] Refactor basic AutoMod spam history to expire inactive users and bound each user's retained message window.
- [x] Add regression coverage for repeated messages, rapid messages, excessive mentions, per-server isolation, stale cleanup, and sliding windows.
- [x] Reuse the same guild configuration read within guild message processing instead of reading it twice for AutoMod and prefix commands.
- [x] Stop logging full guild message bodies and raw prefix-command arguments.
- [x] Use the central configured primary-owner ID for system-health and restart notifications.
- [x] Preserve the separate new-server owner DM and developer guild-join DM from the previous iteration.

## Added since the first v1.1 batch

- [x] 👑 Bot Owner category and consistent restricted-command descriptions and checks.
- [x] /diagnose: non-mutating guild setup checks and tests.
- [x] /roleaudit: read-only high-impact permissions report and tests.
- [x] /ticketstats: private staff summary and strict database errors.
- [x] Patched Zod 4.6.7 and body-parser 2.4.0; security audit passed on updated lockfile.

## Release blockers — do not call v1.1 complete yet

- [x] **Dependency security audit:** Patched Zod, body-parser and iconv-lite. The GitHub security check passed.
- [ ] Full `npm run preflight`, `npm audit --omit=dev --audit-level=high`, Docker build, migration checks and fresh production deployment.
- [ ] Two live Discord server smoke tests (including a server with incomplete permissions), plus tickets, welcome roles, AutoMod, prefix/slash commands and owner notification.
- [ ] Review dashboard, moderation/anti-nuke, ticket reopen/claim, rate limiting, reaction roles and music for regression and concurrency edge cases.
- [ ] Review operator-facing upgrade/restart instructions and announce a maintenance window if a schema migration is required.
- [ ] Explicitly approve and plan any new or paid features; do not remove free moderation/security tools.
- [ ] Set `package.json` to v1.1.0 and publish release notes **only when the gates above pass**.

## Next recommended development work

1. **Security / reliability:** Fix and verify dependency advisories, test PostgreSQL migration and degraded-mode recovery; test restart-watchdog behaviour on the actual host.
2. **Core diagnostics:** `/diagnose` implemented. Still test a correctly configured and an incomplete live server.
3. **Support operations:** `/ticketstats` implemented. Live-test with staff and non-staff accounts.
4. **Moderator safety:** `/roleaudit` implemented; exercise lockdown recovery in a test guild.
5. **User experience:** Audit dashboard menus, stale component errors, loading/timeout messages, embed consistency, help pagination and music error messages.

## Existing command design notes

See `docs/BEACON_V1_1_NEW_COMMANDS_PLAN.md` and `docs/BEACON_V1_1_COMMAND_IDEAS.md` for overlap analysis. Do not duplicate existing slash commands.

**Branch policy:** All current v1.1 work is made on `main`; the legacy `v1.1-dev` branch is not used. GitHub's branch settings can delete it manually when convenient.
