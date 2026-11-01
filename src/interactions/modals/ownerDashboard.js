import { ownerDashboardModal } from '../../commands/Core/modules/ownerDashboardActions.js';
export default {name:'owner_form',execute:(interaction,client,args=[])=>ownerDashboardModal(interaction,args)};
