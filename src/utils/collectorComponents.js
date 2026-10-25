/** Component custom IDs handled by ephemeral message collectors — skip global handlers. */
const COLLECTOR_MANAGED_PREFIXES = [
  'config_select',
  'config_wizard',
  'dashboard_', 'progress_panel', 'progress_reroll',
  // These panels own their own ephemeral component collectors.
  'rr_edit_', 'rr_delete_', 'rr_repost_', 'rr_opts_', 'rr_add_', 'rr_remove_',
  'cases_', 'jtc_', 'log_dash_', 'ticket_cfg_', 'greet_', 'welcome_', 'commands_',
  'sandpay_',
];

export function isCollectorManagedComponent(customId = '') {
  return COLLECTOR_MANAGED_PREFIXES.some((prefix) => customId.startsWith(prefix));
}
