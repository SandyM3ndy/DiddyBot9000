import {
  helpBackButton,
  helpQuickStartButton,
  helpBugReportButton,
  helpPaginationButton,
  helpCategoryPaginationButton,
} from '../../../handlers/help/helpButtons.js';

const paginationIds = [
  'help-page_first',
  'help-page_prev',
  'help-page_next',
  'help-page_last',
];

const paginationInteractions = paginationIds.map((name) => ({
  name,
  execute: helpPaginationButton.execute,
}));

export default [
  helpBackButton,
  helpQuickStartButton,
  helpBugReportButton,
  ...paginationInteractions,
  { name: 'help-cat-prev', execute: helpCategoryPaginationButton.execute },
  { name: 'help-cat-next', execute: helpCategoryPaginationButton.execute },
];