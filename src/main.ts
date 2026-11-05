import { TITLE } from './title';

const app = document.getElementById('app');
if (app) {
  const heading = document.createElement('h1');
  heading.textContent = TITLE;
  app.append(heading);
}
