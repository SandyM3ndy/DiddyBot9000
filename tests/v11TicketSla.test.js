import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTicketSla, getTicketSlaMinutes } from '../src/services/ticketSlaService.js';
import ticket from '../src/commands/Ticket/ticket.js';
test('first-reply SLA only marks unanswered open tickets overdue', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const open = {status:'open', createdAt:'2026-10-24T10:00:00Z'};
  assert.equal(evaluateTicketSla(open, {}, now).overdue, true);
  assert.equal(evaluateTicketSla({...open, firstResponseAt:'2026-10-24T11:00:00Z'}, {}, now).overdue, false);
  assert.equal(evaluateTicketSla({...open, slaAlertedAt:'2026-10-24T11:05:00Z'}, {}, now).overdue, false);
  assert.equal(evaluateTicketSla({...open,status:'closed'}, {}, now).overdue,false);
  assert.equal(getTicketSlaMinutes({ticketSlaMinutes:0}),0);
});
test('SLA is part of ticket suite and optional 0-off configuration', () => {
  assert.ok(ticket.data.toJSON().options.some(o => o.name === 'sla'));
});
