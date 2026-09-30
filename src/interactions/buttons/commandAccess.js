import { handleDashboardComponent } from '../../commands/Core/modules/commands_dashboard.js';

export default [
  'cmdaccess_toggle_category',
  'cmdaccess_enable_all',
  'cmdaccess_disable_all',
  'cmdaccess_reset_commands',
  'cmdaccess_refresh',
  'cmdaccess_home',
].map((name) => ({
  name,
  async execute(interaction, client) {
    return handleDashboardComponent(interaction, client);
  },
}));
