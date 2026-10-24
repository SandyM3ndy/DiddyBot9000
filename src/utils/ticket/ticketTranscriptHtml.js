// Self-contained HTML archive renderer. Never inject unescaped ticket content.
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeMediaUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net'
    ) ? parsed.href : null;
  } catch { return null; }
}

export function buildTicketTranscriptHtml({ channelName = 'ticket', guildName = 'Discord', messages = [], generatedAt = new Date() }) {
  const stamp = new Date(generatedAt).toISOString();
  const rows = [...messages].sort((a,b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0))
    .map(message => {
      const when = new Date(message.createdTimestamp || generatedAt).toISOString().replace('T',' ').slice(0,16);
      const who = esc(message.author?.tag || message.author?.username || 'Unknown');
      const initials = who.slice(0,2).toUpperCase() || '?';
      const rawText = String(message.content || '');
      const body = rawText
        ? '<div class="body">' + esc(rawText) + '</div>' : '';
      const files = [...(message.attachments?.values?.() || [])].map(file => {
        const link = safeMediaUrl(file.url);
        const name = esc(file.name || 'Attachment');
        return link ? '<a class="attachment" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">📎 ' + name + '</a>'
          : '<span class="attachment">📎 ' + name + ' (link unavailable)</span>';
      }).join('');
      const embeds = (message.embeds || []).map(embed => {
        const title = esc(embed.title || '');
        const description = esc(embed.description || '');
        return title || description ? '<div class="embed">' + (title ? '<strong>' + title + '</strong>' : '') +
          (description ? '<div>' + description + '</div>' : '') + '</div>' : '';
      }).join('');
      return '<article class="message"><div class="avatar">' + initials + '</div><div class="entry">' +
        '<div class="meta"><b>' + who + '</b><time>' + esc(when) + ' UTC</time></div>' +
        (body || files || embeds || '<span class="muted">[Empty message]</span>') + files + embeds + '</div></article>';
    }).join('\n');

  return '<!doctype html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src https://cdn.discordapp.com https://media.discordapp.net; base-uri &#39;none&#39;; form-action &#39;none&#39;">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Beacon Ticket Archive - ' + esc(channelName) + '</title>' +
    '<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#10131c;color:#e5e7f2;font:15px/1.6 system-ui,Arial,sans-serif}' +
    'header{background:linear-gradient(130deg,#1e2c56,#282041);padding:38px max(22px,calc((100vw - 1000px)/2));border-bottom:1px solid #404864}' +
    'main{max-width:1000px;margin:0 auto;padding:28px 22px 70px}h1{margin:8px 0 0;font-size:30px}small,.muted{color:#9fa7bd}' +
    '.pill{color:#b9ccff;letter-spacing:.16em;font-weight:800}.message{display:flex;gap:16px;padding:17px 0;border-bottom:1px solid #242c3b}' +
    '.avatar{background:#485e94;min-width:38px;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:12px;font-weight:700}' +
    '.entry{min-width:0;flex:1}.meta{display:flex;gap:12px;flex-wrap:wrap}.meta time{font-size:12px;color:#9fa7bd}' +
    '.body,.embed{white-space:pre-wrap;overflow-wrap:anywhere}.attachment{display:block;color:#a8c7ff;margin-top:8px;text-decoration:none}' +
    '.embed{border-left:3px solid #6888ef;background:#1b2334;border-radius:4px;padding:10px 14px;margin-top:8px}footer{color:#9fa7bd;margin-top:32px;font-size:12px}' +
    '</style></head><body><header><span class="pill">✦ BEACON SUPPORT ARCHIVE</span><h1>#' + esc(channelName) + '</h1>' +
    '<small>' + esc(guildName) + ' • ' + messages.length + ' messages • Exported ' + esc(stamp) +
    '</small></header><main>' + (rows || '<p class="muted">No messages in this ticket.</p>') + '<footer>Private support transcript. Store securely and share only with authorized staff. Attachment links may expire.</footer></main></body></html>';
}
