import { REACTION_ROLE_SETUP_BUTTON, handleReactionRoleCreateButton } from '../../../commands/Reaction_roles/reactionRoleSetup.js';

export default {
  name: REACTION_ROLE_SETUP_BUTTON,
  async execute(interaction) {
    return handleReactionRoleCreateButton(interaction);
  },
};
