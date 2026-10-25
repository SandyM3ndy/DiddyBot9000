# Beacon — Your community's all-in-one Discord assistant.

**Beacon** is your community's all-in-one Discord assistant. Keep your server organised with moderation, tickets, logging, reaction roles and utilities, while bringing members together through global server rankings, 25 rotating daily quests, weekly challenges, milestones, founding-community badges and shareable rank cards.

Built with Discord.js v14 and PostgreSQL. Existing server progression is designed to survive restarts and upgrades, subject to persistent hosting and reliable backups.

**Try it in your server:** use `/invite` in a server where Beacon is installed, then `/progression overview` to explore the rankings, or visit the [support server](https://discord.gg/76N2EM6v6k) for assistance.

[Privacy Policy](PRIVACY.md) · [Terms of Service](TERMS.md) · [Report issues](https://discord.gg/76N2EM6v6k)

[![Support Server](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/76N2EM6v6k)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## Table of Contents

- [Features Overview](#features-overview)
- [Quick Setup](#quick-setup)
- [Manual Installation Steps](#manual-installation-steps)
- [Support Server](https://discord.gg/76N2EM6v6k)
- [Required Bot Intents](#bot-intents)
- [Contributing](CONTRIBUTING.md)

<a name="features-overview"></a>
## Features Overview

Beacon offers a complete suite of tools for Discord server management and community engagement:

### 🏆 Global Server Progression
- **World Rankings** — Compare servers by accumulated Server XP, including your global position
- **25 Rotating Daily Quests** — Achievable objectives for tiny or established communities
- **Weekly Challenges** — Progress saved across daily resets
- **Free Quest Reroll** — Server owners can replace one unfinished quest each UTC day
- **Founding Community Badges** — Permanent recognition for Beacon's earliest communities
- **Shareable Rank Cards** — Show off a server's level, XP and rank
- **Contributor Recognition** — Optional public member contribution rankings with privacy controls

### 🛡️ Moderation, security and accountability
- **Moderation cases** — Warnings, timeouts, bans, staff notes and auditable case history
- **Anti-Nuke and role audits** — Review dangerous permissions and protect server configuration
- **Permission-aware controls** — Staff-only views for privileged operations and sensitive records

### 🎫 Support and community feedback
- **Ticket Command Center** — Private support queue, assignment, priority and response metrics
- **Transcripts** — Support conversation archives with staff-only access controls
- **Suggestions** — Community ideas with persisted Under Review, Planned, Accepted and Declined decisions
- **Polls and reports** — Gather feedback and route reports to server staff

### ⚙️ Server configuration and automation
- **Beacon Dashboard** — Server settings, up to four personal favourites and guarded single-setting Undo
- **Reaction Role Studio** — Preview self-assignable role panels and inspect Discord role security
- **Verification and welcome** — Configure member entry, auto-roles and welcome/goodbye messages
- **Join to Create** — Automatically managed temporary voice channels
- **Server statistics** — Channel-based counters for community activity

### 🎉 Giveaways, music and everyday tools
- **Giveaways** — Create, end and reroll eligible giveaways
- **Music** — Playback, queues and interactive controls when a working Lavalink node is connected
- **Useful commands** — `/serverinfo`, `/firstmsg`, `/calculate`, `/todo`, `/search` and more
- **Error Rescue** — Actionable recovery instructions and a support link when an operation fails

**New here?** Start with `/help` → **Start Here**, then open `/dashboard`. Features that depend on optional permissions or external music providers may need extra configuration.


<a name="quick-setup"></a>
## Quick Setup (Recommended for non-coders)

### First-time setup
1. Invite Beacon using the bot's `/invite` command in an existing server, or contact the [support server](https://discord.gg/76N2EM6v6k).
2. Open `/dashboard` for server configuration.
3. Use `/progression overview` and select **Enable Progression** (server owner only).
4. Open `/ticket panel` to configure support tickets, or `/reactroles studio` for self-assignable roles.
5. Use `/diagnose` to check server setup and permissions. Explore `/progression quests` and `/progression weekly` when progression is enabled.

Progression is free and optional. Nothing resets your existing Server XP when you enable or disable it.

For a guided walkthrough, use `/help` → **Start Here**. Commands and admin-only actions require appropriate Discord permissions.

## Docker Deployment (Recommended)

Beacon is fully containerized for easy deployment.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SandyM3ndy/DiddyBot9000.git
   cd DiddyBot9000
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Set at minimum `DISCORD_TOKEN` and `CLIENT_ID`; `GUILD_ID` is optional for development. Docker Compose also reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from `.env` (defaults: `beacon` / `password` / `beacon`).

3. **Build and start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Check status:**
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

This starts the bot and PostgreSQL. The compose file sets `POSTGRES_SSL=false` and `AUTO_MIGRATE=true` for the bundled database. Music uses public Lavalink v4 nodes from `lavalink/nodes.json` by default.

### Music

Music uses [Lavalink v4](https://github.com/lavalink-devs/Lavalink) via [Riffy](https://github.com/riffy-rb/riffy), similar to [Musicify](https://github.com/codebymitch/Musicify).

1. By default, the bot loads the public Lavalink nodes listed in [`lavalink/nodes.json`](lavalink/nodes.json). Availability is provided by third parties and can change; edit the file to replace offline nodes.
2. To self-host Lavalink instead, run `docker compose --profile local-lavalink up -d` and set single-node env vars in `.env`:
   ```env
   LAVALINK_HOST=lavalink
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```
   Explicit `LAVALINK_HOST` configuration takes precedence over nodes in `lavalink/nodes.json`.
3. Override nodes inline with `LAVALINK_NODES` (JSON array) or point at another file with `LAVALINK_NODES_FILE`.
4. Use `/play <song>` from a voice channel, or `/join` to connect without playing. Prefix shortcuts: `join`, `np`, `leave`, `pause`, `resume`, `skip`, `stop`, `volume <0-100>`, or `music <subcommand>`. Use `/nowplaying` and `/queue` for status; `/music` for loop, shuffle, seek, and other controls.

### Using GitHub Container Registry

The bot is automatically published to GitHub Container Registry on every push to main.

```bash
docker pull ghcr.io/sandym3ndy/diddybot9000:main
```

<a name="manual-installation-steps"></a>
## Manual Installation Steps

### Prerequisites
- Node.js 20.10.0 or higher
- PostgreSQL server (**required for durable production data**; optional memory storage is for local development only)
- Discord bot application with proper intents

1. **Clone the Repository**
   ```bash
   git clone https://github.com/SandyM3ndy/DiddyBot9000.git
   cd DiddyBot9000
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (only the following variables require configuration, leave remaining variables as default):
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   # Optional development-only guild ID
   GUILD_ID=your_discord_guild_id_here

   # PostgreSQL Configuration (Primary Database)
   # Set a usable connection URL or equivalent individual PostgreSQL settings.
   POSTGRES_URL=postgresql://postgres:yourpassword@localhost:5432/beacon
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=beacon
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=yourpassword
   ```

   Production note:
   - `NODE_ENV=production`
   - `LOG_LEVEL=warn` for a clean production console (critical issues + startup status)
   - `LOG_LEVEL=info` if you want more detailed operational logs
   - If your chosen `PORT` is already used, Beacon automatically tries the next port(s)

   Environment options reference:
   - `NODE_ENV`: `development`, `production`, `test` (any non-`production` value is treated as non-production)
   - `LOG_LEVEL`: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`
   - Accepted aliases for `LOG_LEVEL` in this bot: `warns`, `warning`, `warnings` → `warn`

   Recommended production `.env` (easy mode + default mode):
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   WEB_HOST=0.0.0.0
   PORT=3000
   PORT_RETRY_ATTEMPTS=5
   ```
   This gives clear startup/online status messages while keeping logs simple for non-technical operators.
   If port `3000` is busy, the bot tries the next available ports automatically (up to `PORT_RETRY_ATTEMPTS`).

### Multiple servers

Slash commands are registered **globally** on startup (via `CLIENT_ID`), so the bot works in every server it is invited to. `GUILD_ID` stays in the tutorial `.env` for setup steps but is not used for command registration.

Notes:
- Global slash commands may take up to about an hour to propagate on first deploy
- Each server has **isolated** data: config, economy, tickets, leveling, dashboards, warnings, etc. (all keys are scoped as `guild:{guildId}:...`)
- In the [Discord Developer Portal](https://discord.com/developers/applications), ensure your bot is not restricted to a single guild if you plan to invite it elsewhere
- Generate an OAuth2 invite URL from the [Discord Developer Portal](https://discord.com/developers/applications) (OAuth2 → URL Generator, scopes: `bot` and `applications.commands`)

4. **Setup PostgreSQL Database** (Optional but recommended)
   ```bash
   # Create database and user
   createdb beacon
   createuser beacon
   psql -c "ALTER USER beacon PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE beacon TO beacon;"
   ```

5. **Verify Database Setup**
   ```bash
   npm run migrate:check
   ```

6. **Start the Bot**
   ```bash
   npm start
   ```

> **Note on database migrations:** Schema tables and legacy key migrations run
> **automatically on startup**, so` managed hosts like **Railway** need no manual
> migration step — just deploy/restart. To disable auto-migration set
> `AUTO_MIGRATE=false`. You can still run a manual key migration locally with
> `node scripts/migrate-keys.js --dry-run` (preview) or `node scripts/migrate-keys.js`.
<a name="bot-intents"></a>

## Required Bot Intents
Beacon requires the following Discord intents:
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### Required Permissions
- **View Channels**
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Manage Messages**
- **Manage Channels**
- **Manage Roles**
- **Kick Members**
- **Manage Messages**
- **Ban Members**
- **Moderate Members**
- **Connect**

## License

Beacon is released under the MIT License. See [LICENSE](LICENSE) for details.

## Thank You

Thank you for choosing Beacon for your Discord server! We're constantly working to improve and add new features based on community feedback.

*Last updated: October 2026*
