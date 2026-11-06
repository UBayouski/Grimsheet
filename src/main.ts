import { mountApp, browserStorage } from './ui/index';
import { STUB_LEVELS } from './stub-levels';
import './styles/grid-ui.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { levels: STUB_LEVELS, storage: browserStorage() });
}
