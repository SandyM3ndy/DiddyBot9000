# Beacon v1.1 Command Migration

**Branch:** main. **Release status:** in development, not live-verified.  
GitHub Docker publishing does **not** automatically confirm the host has deployed the build.

## New slash commands

- Giveaways: /giveaway create, /giveaway end, /giveaway reroll, /giveaway delete
- Tickets: /ticket add, remove, rename, claim, unclaim, close, reopen, priority, info, transcript, my, queue, stats, panel.
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


## Ticket system revamp — October 2026

### New experience
- Branded support-center panel with Support, Report, Bug and Other request categories.
- Private My Tickets button and /ticket my for request history.
- /ticket queue for staff: open requests ordered by urgency and age.
- /ticket info, /ticket transcript (private file export), /ticket reopen and /ticket unclaim.
- /ticket panel opens the support settings dashboard for Manage Server users.
- Ticket controls have dedicated rows to stay under Discord's button limit.
- Ticket records contain a stable channel topic marker; renaming no longer breaks activity monitoring.
- The first actual staff message is timestamped and measured separately from the first ticket claim.

### Reliability and privacy
- Ticket creation is serialized per requester per process; lifecycle operations are serialized by ticket channel per process.
- Failed ticket creation attempts roll back new channels and database records where possible.
- Ticket-count database errors are reported rather than treated as zero tickets.
- Close, claim, release and priority updates distinguish saved state changes from noncritical Discord display failures.
- A closed ticket must be reopened before it can be claimed.
- A transcript must be successfully delivered to a configured PRIVATE archive channel before channel deletion proceeds.
- Transcript archives are escaped HTML with a strict content security policy and attachment references.
- Removing a channel retains minimal support metrics and customer feedback metadata (not message bodies) so surveys and historical stats continue working.
- Deleting the ticket setup is now a guarded reset; open and closed-but-unarchived tickets block the reset. Archived history is preserved.
- Only the ticket creator can leave feedback; ratings are restricted to 1–5, and failures are not acknowledged as saved.
- Ticket archives must be stored in a channel where @everyone lacks View Channel permission.
- Messages and moderator controls preserve permissions; a user cannot use /ticket queue without ticket staff or server-management privileges.

### Release smoke tests
1. Open the public support panel, select each category and create a ticket.
2. Run the five controls in the initial ticket message; test Claim, Release and priority changes on two staff accounts.
3. Test slash history, queue, info, private transcript, reopen and staff dashboard permissions.
4. Close a ticket and verify the creator's access changes; reopen as ticket staff.
5. Configure a PRIVATE transcript channel, click Delete, cancel once, then confirm. Verify the archive appears before the channel disappears.
6. Attempt deletion with an absent or public archive channel; the ticket must stay intact.
7. Submit a valid and invalid rating, deny feedback from other users, and confirm feedback remains available after archival.
8. Simulate two concurrent ticket creates/claims and verify no double assignment.
9. Check first staff message timing, queue ordering, renamed ticket activity and expiry settings.
10. Test the setup-reset safeguard when open/closed tickets still exist.
11. Confirm Railway (or the actual host) is running the latest commit, not merely that GitHub published a Docker image.

**Not yet certified:** multi-replica DB locking, real-world Discord component behavior, and hosting deployment are separate live validation gates. V1.1 is not officially released.
