import { mountApp, browserStorage } from './ui/index';
import { LEVELS } from './levels/index';
import './styles/fonts.css';
import './styles/grid-ui.css';
import './styles/error-monsters.css';
import './styles/chrome.css';
import './styles/motion.css';

const root = document.getElementById('app');
if (root) {
  mountApp(root, { levels: LEVELS, storage: browserStorage(), showTitle: true });
}
