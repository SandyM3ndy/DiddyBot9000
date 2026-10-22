# Beacon v1.1 — Polish Update (Part 1)

Status: **In development**. Successful GitHub commits do not mean the release has passed Discord or Railway testing.

## Confirmed removals
- `/fight` — command implementation and prefix alias removed with owner approval.
- **No other commands have been removed.**

## Command audit: owner decisions required
- Two implementations define `/poll`: `src/commands/Community/poll.js` uses one pipe-separated options input; `src/commands/Tools/poll.js` uses several separate option fields. The loader currently keeps the first implementation. Owner must choose a preferred behaviour before they are merged.
- `/stats`, `/status`, `/uptime`, `/ping`, and `/botinfo` overlap in reporting bot information, but serve some distinct purposes. Decide which to retain/merge before modifying registration.
- `/lock` and `/lockdown` are different scopes and should not be treated as duplicates automatically.
- Configuration commands hidden in the loader should not be shown in `/help`. Server configuration is accessed through `/dashboard`.

## Development stages
1. **Command cleanup:** initial file-level command audit; approved `/fight` removal; loader now logs duplicate command names.
2. **Bug fixes:** `/uptime` syntax repaired; `/cases` button interactions acknowledged correctly; stale dashboard instructions corrected.
3. **Visual consistency:** corrected old TitanBot bug-report branding and support URL; first pass on Fun-command responses.
4. **System polishing:** first pass on Core, Fun and moderation; security, tickets, applications, music, giveaway, community and economy still need QA.
5. **Help redesign:** help now lists actual loaded commands, not every file on disk; permission wording corrected.
6. **Performance and diagnostics:** help command mentions cached; command-loader file URLs corrected; duplicate logging improved.
7. **Release checks:** build-time syntax check and GitHub CI added; manual interactive tests still required.

## Verification checklist (not yet complete)
- [ ] All slash commands register successfully, without duplicate names
- [ ] `/help` opens, displays correct categories and navigates through categories and pages
- [ ] Hidden/removed commands do not appear in Discord command picker or `/help`
- [ ] Moderator cases and buttons work for permitted and unauthorized users
- [ ] Permission failures show helpful messages and do not crash the bot
- [ ] Anti-nuke and emergency lockdowns work only with authorized server owners
- [ ] Ticket, applications, giveaway, verification, music, leveling, and economy workflows
- [ ] PostgreSQL data persists after a Railway restart
- [ ] CI and Docker image syntax checks pass
- [ ] No unexpected changes to existing server configuration
- [ ] Publish official v1.1 changelog and only then update release version

## Later v1.1 polish commits
- `/generatepassword` uses unbiased secure random generation with automated unit tests.
- `/verify` now defers promptly, and `/apply` form submission acknowledges before database work.
- `/announcement` and `/broadcast` have bounded lengths and safer mention handling; broadcasts no longer create server invites.
- URL shortening rejects non-web URL schemes and has updated Beacon branding.
- A static command audit is part of the preflight checks, reporting `/poll` as an existing duplicate awaiting owner decision.
- Native Discord monetization has **not** been implemented; see `docs/BEACON_PREMIUM_CONCEPT.md`.

## Follow-up: 21 October 2026

- Fixed and reduced countdown message edits; owners can now control their own timers.
- Added paginated categories and bounded embed fields to `/help` with automated tests.
- Fixed concurrent calculator sessions and the target message for modal updates.
- Added expiry and ownership checks for calculator modals.
- Current automated checks pass, but manual Discord regression testing remains outstanding.
- See `BEACON_V1_1_CHANGELOG_DRAFT.md` for the full development summary.

## 22 October 2026 — Additional polishing

- `/antinuke` acknowledges interaction promptly, sends private branded results and rolls back in-memory changes when persistence fails.
- `/massban` and `/masskick` reject malformed and oversized lists, deduplicate IDs, disallow owner targeting, and never misreport a successful punishment solely because logging failed.
- `/help` now labels multi-permission requirements using **and**, never the inaccurate **or**.
- `/say` disables unexpected mention pings; its delivery error is shown to the moderator.
- `/warn` and the warning service now report counts of active, non-deleted warnings; logging failures do not misreport persisted warnings.
- `/warnings` displays private paginated warning lists, stable delete indices, better error handling and faster modals.
- Additional regression tests cover mass actions, permission labels, warning totals and warning pages.
- Proposed `/diagnose`, `/roleaudit`, and `/suggestions` remain **unregistered**. See `BEACON_V1_1_NEW_COMMANDS_PLAN.md`.
