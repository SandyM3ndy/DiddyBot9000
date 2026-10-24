import dashboard from '../../commands/Core/dashboard.js';

export default {
  name: 'beacon_home',
  async execute(interaction) {
    // Open a fresh private session. The original nested settings collector may
    // have ended; reusing it would produce buttons that do not respond.
    return dashboard.execute(interaction);
  },
};
