# Beacon reply visibility policy

Discord replies should be public when they contain useful, shareable community information. They should be private whenever they expose personal information, sensitive moderation activity, configuration or security details. Discord does not let an ephemeral reply be made public later, so the command must choose visibility **before** its first reply or defer.

## Public by default
- /help and /help search (use **private:true** to hide it)
- /status for regular users (owner-specific diagnostics remain private)
- /support, /invite, /botinfo, /ping
- /userinfo (use **private:true** to hide it)
- /count status and /count leaderboard (configuration actions remain private)
- /progression overview, quests, leaderboard, rank and milestones
- /time now and /time unix
- /play, /join, /queue, /nowplaying, and normal /music playback controls
- Public-information and entertainment commands that already reply publicly (e.g. /flip, /roll, /serverinfo)

## Private or staff-restricted
- /dashboard, /diagnose, /roleaudit, /antinuke, /cases and individual moderation controls
- /ticket personal requests, transcripts, support queues and configuration
- /warnings, /usernotes, /report file and sensitive application status
- /todo personal and shared-list operations
- /music status for internal service diagnostics
- /apply submit and /apply status (but /apply list is public)
- /suggest and /poll send a **separate public post**; their command confirmation stays private to avoid a duplicate message
- /embedbuilder editor and drafts stay private until publication

A public reply is not the same as granting permission to run a command. Existing permission and owner checks must still apply.

There is no fixed percentage target: visibility is chosen based on the data in each response. Any new commands should use public replies only if their **entire** success payload is safe to share; error and permission denial details should remain private where possible.

## Deployment check
After deploying the latest main build, test /help, /userinfo, /count leaderboard and /queue for public replies, then verify /dashboard, /ticket transcript, /cases and /todo list remain private.
