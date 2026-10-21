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
