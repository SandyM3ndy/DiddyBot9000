import {
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  warningPageHandler,
} from '../../../handlers/warningHandlers.js';

export default [
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  { name: 'warning_page_prev', execute: warningPageHandler.execute },
  { name: 'warning_page_next', execute: warningPageHandler.execute },
];
