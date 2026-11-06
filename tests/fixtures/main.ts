import { mountApp, browserStorage } from '../../src/ui/index';
import { FIXTURE_LEVELS } from './levels';
import '../../src/styles/grid-ui.css';
import '../../src/styles/error-monsters.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { levels: FIXTURE_LEVELS, storage: browserStorage() });
}
