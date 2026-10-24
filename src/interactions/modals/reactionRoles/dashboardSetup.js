import { REACTION_ROLE_SETUP_MODAL, createReactionRolePanelFromModal } from '../../../commands/Reaction_roles/reactionRoleSetup.js';

export default {
  name: REACTION_ROLE_SETUP_MODAL,
  async execute(interaction, client) {
    return createReactionRolePanelFromModal(interaction, client);
  },
};
