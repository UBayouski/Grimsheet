import { mountApp, browserStorage } from '../../src/ui/index';
import { ERROR_FIXTURE_LEVELS } from './errors';
import '../../src/styles/grid-ui.css';
import '../../src/styles/error-monsters.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { levels: ERROR_FIXTURE_LEVELS, storage: browserStorage() });
}
