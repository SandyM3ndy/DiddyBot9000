import { handleDashboardComponent } from '../../commands/Core/modules/commands_dashboard.js';

export default [
  'cmdaccess_category',
  'cmdaccess_command',
].map((name) => ({
  name,
  async execute(interaction, client) {
    return handleDashboardComponent(interaction, client);
  },
}));
