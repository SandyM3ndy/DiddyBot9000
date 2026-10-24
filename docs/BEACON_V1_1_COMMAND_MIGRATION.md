# Beacon v1.1 Command Migration

**Branch:** main. **Release status:** in development, not live-verified.  
GitHub Docker publishing does **not** automatically confirm the host has deployed the build.

## New slash commands

- Giveaways: /giveaway create, /giveaway end, /giveaway reroll, /giveaway delete
- Tickets: /ticket add, /ticket remove, /ticket rename, /ticket claim, /ticket close, /ticket priority, /ticket stats
- Time: /time now, /time unix
- Progression: /progression rank, /progression milestones, with existing overview/quests/leaderboard
- Warnings: /warnings add, /warnings list
- Verification: /verification auto-setup, /verification auto-dashboard, with existing setup/remove/dashboard
- Channel permissions: /channel lock and /channel unlock
- Owner: /ownerstats replaces /popularity
- /greet dashboard manages both welcome and goodbye
- /music status displays Lavalink, voice and queue health

## Removed from the public slash interface

- Legacy gcreate/gend/greroll/gdelete, ticketadd/ticketremove/ticketrename/claim/close/priority/ticketstats, time/unixtime (time is now subcommand-only), rank/levels, warn, autoverify, lock/unlock, goodbye and popularity.
- Decommissioned: broadcast, shorten, generatepassword, firstmsg, randomuser.
- Legacy source handlers remain for rollback or limited text-command compatibility; do not assume all retired slash commands still work as text prefixes.

## Interface improvements

- Cleaner help command center and grouped command descriptions.
- Redesigned ticket, welcome, server, Anti-Nuke and bot owner dashboards.
- Editable embed templates for announcements, rules, updates and welcome messages.
- Public counting-game status and leaderboard; Manage Server remains required for changes.
- Better formatting for personal to-do lists and applicant review queues.

## Reliability and safety improvements

- Staff application listing no longer deletes records when member lookups fail.
- Emergency lockdown restoration retains saved backups when any role or channel cannot be restored.
- Runtime slash-command registration errors are no longer silently swallowed.
- Patched third-party dependencies and regression tests.

## Live release checks not yet performed

- Confirm the hosting platform is running the latest image from main.
- Verify slash-command registration in Discord and that retired names vanish.
- Test ticket permissions, ticket transcripts, role hierarchies, AutoMod, verification, applications, Lavalink reconnect, interactive components and lockdown restore in a test guild.
- Bump version to 1.1.0 only after those checks.
