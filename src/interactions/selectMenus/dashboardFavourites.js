import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
 DASHBOARD_FAVOURITES,toggleDashboardFavourite,formatDashboardFavourites
} from '../../services/dashboardExperienceService.js';

export default {
  name:'dashboard_fave_pin',
  async execute(interaction,client,args=[]){
    const guildId=args[0];
    if(!interaction.guild || interaction.guildId!==guildId ||
        !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){
      return InteractionHelper.safeReply(interaction,{
        content:'🔒 You need Manage Server to modify dashboard favourites.',
        flags:MessageFlags.Ephemeral,
      });
    }
    if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
    try{
      const key=interaction.values?.[0];
      const feature=DASHBOARD_FAVOURITES.find(x=>x.id===key);
      if(!feature)return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Invalid favourite selection.'});
      const saved=await toggleDashboardFavourite(client,guildId,interaction.user.id,key);
      return InteractionHelper.safeEditReply(interaction,{
        content:'⭐ Favourites updated and saved.\n**Current:** '+
           (formatDashboardFavourites(saved).join(' • ')||'None')+
           '\nPress **Refresh** on your Beacon dashboard to update shortcuts.',
        components:[],
      });
    }catch{
      return InteractionHelper.safeEditReply(interaction,{
        content:'❌ Your favourite was not saved. Check persistent storage and try again.',
        components:[],
      });
    }
  },
};
