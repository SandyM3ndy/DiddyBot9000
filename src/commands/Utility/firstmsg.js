import {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export function buildFirstMessageDetails(message, guildId, channel) {
  const url = 'https://discord.com/channels/' + guildId + '/' + channel.id + '/' + message.id;
  const unix = Math.floor(Number(message.createdTimestamp) / 1000);
  const authorId = message.author?.id;
  return {
    url,
    embed: createEmbed({
      title: '📜 Beacon • The First Message',
      description: '**In <#' + channel.id + '>**\n\n' +
        '[**Jump to the first message**](' + url + ')\n' +
        'Discover where the conversation began.',
      color: 'primary',
      fields: [
        { name: '👤 Author', value: authorId ? '<@' + authorId + '>' : 'Unknown', inline: true },
        { name: '📅 Posted', value: Number.isFinite(unix) && unix > 0 ? '<t:' + unix + ':F>' : 'Unknown', inline: true },
        { name: '🔗 Message ID', value: String(message.id), inline: false },
      ],
      footer: 'Beacon • First Message Explorer',
    }),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('firstmsg')
    .setDescription('Find the first accessible message in a channel')
    .setDMPermission(false)
    .addChannelOption(option=>option.setName('channel')
      .setDescription('Choose a channel (defaults to this channel)')
      .addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)
      .setRequired(false)),
  category:'Utility',
  async execute(interaction) {
    const channel = interaction.options?.getChannel?.('channel') || interaction.channel;
    // Viewing a different channel must not publicly expose a private channel's
    // content or link to everyone in the command's original channel.
    const crossChannel = Boolean(channel?.id && channel.id !== interaction.channelId);
    if(!(await InteractionHelper.safeDefer(interaction,crossChannel?{flags:MessageFlags.Ephemeral}:{})))return;
    if(!interaction.guildId || !channel?.messages?.fetch) {
      return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Select a server text channel that Beacon can read.'});
    }
    const viewer=interaction.guild?.members?.cache?.get(interaction.user.id)
      || await interaction.guild?.members?.fetch?.(interaction.user.id).catch(()=>null)
      || interaction.member;
    const me=interaction.guild?.members?.me || await interaction.guild?.members?.fetchMe?.().catch(()=>null);
    const required=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];
    if(!viewer || !channel.permissionsFor?.(viewer)?.has(required)) {
      return InteractionHelper.safeEditReply(interaction,{content:'🔒 You need View Channel and Read Message History to explore that channel.'});
    }
    if(!me || !channel.permissionsFor?.(me)?.has(required)) {
      return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Beacon needs View Channel and Read Message History in the selected channel.'});
    }
    try {
      const messages=await channel.messages.fetch({limit:1,after:'1',cache:false});
      const first=messages?.first?.();
      if(!first) {
        return InteractionHelper.safeEditReply(interaction,{
          embeds:[createEmbed({title:'📜 No Messages Found',
            description:'No accessible messages were found in <#'+channel.id+'>. The earliest messages may have been deleted.',
            color:'info'})],
        });
      }
      const {url,embed}=buildFirstMessageDetails(first,interaction.guildId,channel);
      const jump=new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setLabel('Jump to Message').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(url));
      return InteractionHelper.safeEditReply(interaction,{
        embeds:[embed],components:[jump],allowedMentions:{parse:[]},
      });
    }catch(error) {
      logger.warn('First message lookup failed',{guildId:interaction.guildId,channelId:channel.id,error:error?.message});
      return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Beacon could not read that channel’s message history. Check permissions and try again.'});
    }
  },
};
