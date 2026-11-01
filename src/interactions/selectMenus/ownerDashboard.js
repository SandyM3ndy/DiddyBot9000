import { ownerDashboardSelect } from '../../commands/Core/modules/ownerDashboardActions.js';
export default {name:'owner_dashboard',execute:(interaction,client,args=[])=>ownerDashboardSelect(interaction,args)};
