import createTicketHandler, {
  myTicketsButtonHandler,
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
  deleteTicketConfirmHandler,
  deleteTicketCancelHandler,
} from '../../../handlers/ticketButtons.js';

export default [
  createTicketHandler,
  myTicketsButtonHandler,
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
  deleteTicketConfirmHandler,
  deleteTicketCancelHandler,
];