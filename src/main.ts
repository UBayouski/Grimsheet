import { mountApp, browserStorage } from './ui/index';
import { LEVELS } from './levels/index';
import './styles/grid-ui.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { levels: LEVELS, storage: browserStorage() });
}
