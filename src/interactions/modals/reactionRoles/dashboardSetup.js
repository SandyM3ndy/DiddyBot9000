import { REACTION_ROLE_SETUP_MODAL, createReactionRolePanelFromModal } from '../../../utils/reactionRoles/reactionRoleSetup.js';

export default {
  name: REACTION_ROLE_SETUP_MODAL,
  async execute(interaction, client) {
    return createReactionRolePanelFromModal(interaction, client);
  },
};
