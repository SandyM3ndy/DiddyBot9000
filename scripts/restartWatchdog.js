import 'dotenv/config';

const healthUrl = process.env.DIDDY_RESTART_HEALTH_URL;
const ownerId = process.env.DIDDY_RESTART_OWNER_ID || '1022691434974957618';
const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

if (!healthUrl || !token) {
  process.exit(1);
}

const deadline = Date.now() + 2 * 60 * 1000;
let recovered = false;

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, {
      headers: { 'User-Agent': 'DiddyBot9000-RestartWatchdog/1.0' },
    });

    if (response.ok) {
      recovered = true;
      break;
    }
  } catch {
    // The old process is expected to be offline during the restart.
  }

  await new Promise(resolve => setTimeout(resolve, 5000));
}

if (recovered) {
  process.exit(0);
}

try {
  const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: ownerId }),
  });

  if (!dmResponse.ok) {
    process.exit(1);
  }

  const dmChannel = await dmResponse.json();

  await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: '🚨 **DiddyBot9000 restart warning**\\n\\nThe scheduled 12-hour restart was started, but the bot did not become healthy again within 2 minutes. Please check the bot process/host immediately.',
    }),
  });
} catch {
  // Nothing else can safely be done from the detached watchdog.
}

process.exit(1);
