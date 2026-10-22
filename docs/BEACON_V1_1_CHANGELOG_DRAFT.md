# Beacon v1.1 — The Polish Update

**Development changelog — NOT YET RELEASED**

## Confirmed code changes
- Removed `/fight`, including its command implementation and prefix alias (owner approved).
- Restored `/uptime`, `/lockdown`, `/unlockdown`, and Anti-Nuke role-event JavaScript validity.
- Improved command-loader file path handling and duplicate-command warnings.
- Corrected old bug-report branding and command-access guidance.
- Rebuilt `/help` to use the loaded command registry rather than listing files on disk; introduced safer embed field splitting and category pagination.
- Added permissions and interaction acknowledgement improvements to `/cases`, `/apply submit`, `/verify`, and calculator modals.
- Updated `/announcement` and `/broadcast` for length limits, safer mentions, and delivery diagnostics; removed invite-creation side effects from global broadcasts.
- Hardened `/shorten` URL scheme validation and refreshed its Beacon branding.
- Made `/generatepassword` fully cryptographic with character-class guarantees and automated tests.
- Fixed poll formatting and missing reaction-permission feedback without removing or merging either poll command.
- Reduced `/countdown` background CPU work and message edits, and allowed the creator to control their own timer.
- Fixed calculator session state collisions, correct reply message targeting and modal permissions/expiry.
- Added syntax checking, command auditing and unit tests to Docker and GitHub Actions checks.
- Fixed three missing PostgreSQL schema table mappings; migration tests now pass.
- Updated production dependency lockfile using a reviewable PR, clearing the previously reported npm production audit vulnerabilities.


## Polish Round 3 — 21 October 2026
- Restricted `/ticketadd`, `/ticketremove`, and `/ticketrename` to actual tickets and authorised ticket managers; added user-friendly role/channel permission errors.
- Protected ticket creators, server owners and Beacon itself against `/ticketremove`; sanitized channel names and added regression tests.
- Corrected the special `default_member_permissions: 0` case for prefix commands, ensuring administrative restrictions stay enforced; added coverage for admin/mod roles.
- Polished `/purge` with Discord age-limit reporting, precise permissions, reliable audit logging and persistent private results.
- Polished `/suggest` with early acknowledgement, mention safety, permissions diagnostics, and failed-reaction alerts.
- Improved `/queue` and `/nowplaying` server-only behaviour and command acknowledgement.
- Improved giveaway creation rollback: failed persistence no longer silently leaves a live clickable giveaway behind.
- Improved `/gdelete`, `/gend`, and `/greroll` by acknowledging long-running actions before database work.
- Limited winner-announcement mention parsing to actual selected users/host.
- Clarified `/ping` heartbeat vs response latency and reduced unnecessary log noise.
- Restricted internal database failure detail shown by `/status` to the bot owner.
- Fixed preflight execution in the Docker build so unit tests do not require production-only startup secrets.
- Automated verification: 271/271 JavaScript syntax checks, 18/18 unit tests, command audit, security audit, migrations and Docker build all passed for this round.

**Remaining limitations:** No live Railway runtime or interactive Discord smoke-test verification has been performed. The existing `/poll` duplicate needs explicit owner approval before merging or removing either implementation. 

## Explicitly pending
- v1.1 is still under development; `package.json` remains version 1.0.0.
- `/poll` has two existing variants. The owner must approve any merge/removal.
- Live Discord interactions and Railway production deployment have not been verified by this automated QA.
- Remaining full-system UI polish: tickets, applications dashboard, moderation permission matrix, anti-nuke/lockdown end-to-end, giveaway, music, economy/leveling.
- Paid functionality is planning only, not implemented and not part of this first polish batch.

## Pre-release Discord smoke tests
1. `/help` category selection, back button, category pages and all-command pages.
2. `/countdown` controls as creator, moderator and unauthorized member; paused/resumed and completed timer.
3. Two concurrent `/calculate` sessions from the same user and another user's button attempts.
4. `/apply submit` modal button, submitted modal, saved application and reviewer dashboard.
5. `/verify` configured/unconfigured servers, role hierarchy and permission errors.
6. `/cases` pagination, ticket lifecycle, giveaways and music.
7. `/lockdown` and `/unlockdown` with server owner and another moderator.
8. Public and private command responses, database persistence and rollback procedure.

Publish the final release notes and update the bot version only after these tests pass.

## 22 October 2026 — Additional polishing

- `/antinuke` acknowledges interaction promptly, sends private branded results and rolls back in-memory changes when persistence fails.
- `/massban` and `/masskick` reject malformed and oversized lists, deduplicate IDs, disallow owner targeting, and never misreport a successful punishment solely because logging failed.
- `/help` now labels multi-permission requirements using **and**, never the inaccurate **or**.
- `/say` disables unexpected mention pings; its delivery error is shown to the moderator.
- `/warn` and the warning service now report counts of active, non-deleted warnings; logging failures do not misreport persisted warnings.
- `/warnings` displays private paginated warning lists, stable delete indices, better error handling and faster modals.
- Additional regression tests cover mass actions, permission labels, warning totals and warning pages.
- Proposed `/diagnose`, `/roleaudit`, and `/suggestions` remain **unregistered**. See `BEACON_V1_1_NEW_COMMANDS_PLAN.md`.
