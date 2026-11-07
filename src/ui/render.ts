import type { ErrorKind } from '../engine/index';
import { ERROR_CLASS } from './error-look';
import { STRINGS } from './strings';
import type { CellView, TabView, ViewModel } from './types';

export { ERROR_CLASS } from './error-look';

export interface View {
  update(viewModel: ViewModel): void;
  setGhost(address: string | undefined): void;
  /** Sets aria-pressed on the Sound toggle. */
  setSound(on: boolean): void;
  /** Builds the title dialog on first call and makes the frame inert. */
  showTitle(): void;
  /** Removes the title dialog and the inert attribute. */
  hideTitle(): void;
  /** Shows or hides the win dialog; its text comes from update(). */
  setWinDialog(open: boolean): void;
}

const COLUMNS = 12;
const ROWS = 20;
const SEPARATOR_ROW = 13;

function columnLetter(col: number): string {
  return String.fromCharCode(64 + col);
}

/** Sets or removes an attribute, writing only when the value differs. */
function setAttr(el: Element, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  id?: string,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  if (className !== undefined) el.className = className;
  if (id !== undefined) el.id = id;
  return el;
}

interface CellParts {
  readonly td: HTMLTableCellElement;
  readonly text: HTMLSpanElement;
  glyph: HTMLSpanElement | undefined;
  padlock: HTMLSpanElement | undefined;
}

function cellClasses(errorKind: ErrorKind | undefined): string {
  if (errorKind === undefined) return 'cell';
  const kindClass = (ERROR_CLASS as Readonly<Record<string, string | undefined>>)[errorKind];
  return kindClass === undefined ? 'cell cell-error' : `cell cell-error ${kindClass}`;
}

function updateCell(doc: Document, parts: CellParts, cell: CellView): void {
  const { td } = parts;
  setAttr(td, 'class', cellClasses(cell.errorKind));
  setAttr(td, 'data-name', cell.name);
  setAttr(td, 'data-locked', cell.locked ? 'true' : undefined);
  setAttr(td, 'aria-readonly', cell.locked ? 'true' : undefined);
  setAttr(td, 'data-selected', cell.selected ? 'true' : undefined);
  setAttr(td, 'aria-selected', cell.selected ? 'true' : undefined);
  setAttr(td, 'data-changed', cell.changed ? 'true' : undefined);
  setAttr(td, 'data-entity', cell.entity?.type);
  setAttr(td, 'data-monster-id', cell.entity?.type === 'monster' ? cell.entity.id : undefined);
  setAttr(td, 'aria-label', cell.ariaLabel);
  setAttr(td, 'data-error', cell.errorKind);
  setAttr(td, 'title', cell.cause);
  setText(parts.text, cell.text);

  // Glyph: present only with an entity.
  if (cell.entity === undefined) {
    if (parts.glyph) {
      parts.glyph.remove();
      parts.glyph = undefined;
    }
  } else {
    if (!parts.glyph) {
      const glyph = make(doc, 'span', 'entity-glyph');
      glyph.setAttribute('aria-hidden', 'true');
      parts.text.after(glyph);
      parts.glyph = glyph;
    }
    setText(parts.glyph, cell.entity.type === 'hero' ? '@' : 'M');
  }

  if (parts.glyph) setAttr(parts.glyph, 'data-slide', cell.entity?.type === 'hero' ? cell.slide : undefined);

  // Padlock: drawn by CSS, only on locked cells of the rules panel.
  if (!(cell.locked && cell.region === 'rules')) {
    if (parts.padlock) {
      parts.padlock.remove();
      parts.padlock = undefined;
    }
  } else if (!parts.padlock) {
    const padlock = make(doc, 'span', 'padlock');
    padlock.setAttribute('aria-hidden', 'true');
    td.append(padlock);
    parts.padlock = padlock;
  }
}

export function createView(root: HTMLElement): View {
  const doc = root.ownerDocument;
  const cells = new Map<string, CellParts>();

  root.classList.add('grimsheet-app');
  root.textContent = '';

  const windowButtons = (names: readonly string[]): HTMLSpanElement => {
    const group = make(doc, 'span', 'window-buttons');
    group.setAttribute('aria-hidden', 'true');
    for (const name of names) group.append(make(doc, 'span', `wb ${name}`));
    return group;
  };
  const dialogTitleBar = (titleClass: string, titleId?: string): HTMLDivElement => {
    const bar = make(doc, 'div', 'dialog-title-bar');
    const title = make(doc, 'span', titleClass, titleId);
    bar.append(title, windowButtons(['wb-close']));
    return bar;
  };

  const frame = make(doc, 'div', 'window', 'window');

  const header = make(doc, 'header', 'title-bar');
  const titleText = make(doc, 'span', 'title-text');
  titleText.textContent = STRINGS.titleBar;
  header.append(titleText, windowButtons(['wb-min', 'wb-max', 'wb-close']));

  const tabBar = make(doc, 'nav', 'tab-bar', 'tab-bar');
  tabBar.setAttribute('aria-label', STRINGS.tabBarLabel);

  const formulaRow = make(doc, 'div', 'formula-row');
  const nameBox = make(doc, 'div', 'name-box', 'name-box');
  nameBox.setAttribute('role', 'group');
  nameBox.setAttribute('aria-label', STRINGS.nameBoxLabel);
  const formulaBar = make(doc, 'input', 'formula-bar', 'formula-bar');
  formulaBar.type = 'text';
  formulaBar.spellcheck = false;
  formulaBar.setAttribute('autocomplete', 'off');
  formulaBar.setAttribute('aria-label', STRINGS.formulaBarLabel);
  formulaBar.setAttribute('aria-describedby', 'formula-note formula-alert cell-explanation');
  const formulaNote = make(doc, 'span', 'formula-note', 'formula-note');
  const formulaAlert = make(doc, 'span', 'formula-alert', 'formula-alert');
  formulaAlert.setAttribute('role', 'alert');
  const explanation = make(doc, 'p', 'cell-explanation', 'cell-explanation');
  explanation.hidden = true;
  formulaRow.append(nameBox, formulaBar, formulaNote, formulaAlert);

  const toolbar = make(doc, 'div', 'toolbar');
  const buttonFor = (control: string, label: string): HTMLButtonElement => {
    const b = make(doc, 'button');
    b.type = 'button';
    b.setAttribute('data-control', control);
    b.textContent = label;
    return b;
  };
  const undoButton = buttonFor('undo', STRINGS.buttons.undo);
  const recoverButton = buttonFor('recover', STRINGS.buttons.recover);
  const nextButton = buttonFor('next', STRINGS.buttons.next);
  nextButton.hidden = true;
  const soundButton = buttonFor('sound', STRINGS.buttons.sound);
  soundButton.setAttribute('aria-pressed', 'true');
  // The cause line lives in the toolbar row, in the free space between the buttons and Sound, so showing
  // or hiding it never changes the window height (a line of its own in the formula row did).
  toolbar.append(undoButton, recoverButton, nextButton, explanation, soundButton);

  const table = make(doc, 'table', 'grid-table', 'grid-table');
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', STRINGS.gridLabel);
  table.setAttribute('aria-describedby', 'ghost-note');
  table.setAttribute('tabindex', '0');

  // Fixed column widths live in the stylesheet (the view never sets a style attribute). The stylesheet
  // also gives the table an explicit width, so table-layout: fixed applies and a long cell text is
  // clipped instead of widening its column.
  const colgroup = make(doc, 'colgroup');
  colgroup.append(make(doc, 'col', 'col-row-header'), make(doc, 'col', 'col-label'));
  for (let col = 2; col <= COLUMNS; col++) {
    colgroup.append(make(doc, 'col', 'col-cell'));
  }

  const thead = make(doc, 'thead');
  const headRow = make(doc, 'tr');
  headRow.append(make(doc, 'th', 'corner'));
  for (let col = 1; col <= COLUMNS; col++) {
    const th = make(doc, 'th');
    th.setAttribute('role', 'columnheader');
    th.setAttribute('scope', 'col');
    th.textContent = columnLetter(col);
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = make(doc, 'tbody');
  for (let row = 1; row <= ROWS; row++) {
    const tr = make(doc, 'tr');
    const rowHeader = make(doc, 'th');
    rowHeader.setAttribute('role', 'rowheader');
    rowHeader.setAttribute('scope', 'row');
    rowHeader.textContent = String(row);
    tr.append(rowHeader);
    if (row === SEPARATOR_ROW) {
      tr.className = 'separator-row';
      const td = make(doc, 'td');
      td.colSpan = COLUMNS;
      td.setAttribute('role', 'gridcell');
      td.setAttribute('data-separator', 'true');
      td.setAttribute('aria-readonly', 'true');
      td.textContent = STRINGS.panelTitle;
      tr.append(td);
    } else {
      for (let col = 1; col <= COLUMNS; col++) {
        const address = `${columnLetter(col)}${row}`;
        const td = make(doc, 'td', 'cell', `cell-${address}`);
        td.setAttribute('role', 'gridcell');
        td.setAttribute('data-address', address);
        td.setAttribute('data-row', String(row));
        td.setAttribute('data-col', columnLetter(col));
        td.setAttribute('data-region', row < SEPARATOR_ROW ? 'map' : 'rules');
        const text = make(doc, 'span', 'cell-text');
        td.append(text);
        tr.append(td);
        cells.set(address, { td, text, glyph: undefined, padlock: undefined });
      }
    }
    tbody.append(tr);
  }
  table.append(colgroup, thead, tbody);

  const ghostNote = make(doc, 'p', 'visually-hidden', 'ghost-note');

  const dialogButton = (id: string, control: string, label: string): HTMLButtonElement => {
    const b = make(doc, 'button', undefined, id);
    b.type = 'button';
    b.setAttribute('data-control', control);
    b.textContent = label;
    return b;
  };

  const banner = make(doc, 'div', 'end-banner dialog', 'end-banner');
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-labelledby', 'banner-title');
  banner.setAttribute('aria-describedby', 'banner-body');
  banner.hidden = true;
  const bannerBar = dialogTitleBar('banner-title dialog-title', 'banner-title');
  const bannerTitle = bannerBar.firstElementChild as HTMLSpanElement;
  const bannerBodyWrap = make(doc, 'div', 'dialog-body');
  const bannerBody = make(doc, 'p', 'banner-body', 'banner-body');
  const bannerRecover = dialogButton('end-recover', 'recover-dialog', STRINGS.buttons.recover);
  bannerRecover.setAttribute('data-default', '');
  const bannerButtons = make(doc, 'div', 'dialog-buttons');
  bannerButtons.append(bannerRecover);
  bannerBodyWrap.append(bannerBody, bannerButtons);
  banner.append(bannerBar, bannerBodyWrap);

  const statusBar = make(doc, 'footer', 'status-bar', 'status-bar');
  const statusLevel = make(doc, 'span', 'status-level');
  const statusHp = make(doc, 'span', 'status-hp');
  const statusInk = make(doc, 'span', 'status-ink');
  const statusTurn = make(doc, 'span', 'status-turn');
  const message = make(doc, 'p', 'message', 'message');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  statusBar.append(statusLevel, statusHp, statusInk, statusTurn, message);

  const overlay = make(doc, 'div', undefined, 'screen-overlay');

  const winDialog = make(doc, 'div', 'dialog win-dialog', 'win-dialog');
  winDialog.setAttribute('role', 'dialog');
  winDialog.setAttribute('aria-labelledby', 'win-title');
  winDialog.setAttribute('aria-describedby', 'win-body');
  winDialog.hidden = true;
  const winBar = dialogTitleBar('dialog-title', 'win-title');
  const winTitle = winBar.firstElementChild as HTMLSpanElement;
  const winBodyWrap = make(doc, 'div', 'dialog-body');
  const winBody = make(doc, 'p', undefined, 'win-body');
  const winNext = dialogButton('win-next', 'win-next', STRINGS.buttons.next);
  const winOk = dialogButton('win-ok', 'win-ok', STRINGS.buttons.ok);
  const winButtons = make(doc, 'div', 'dialog-buttons');
  winButtons.append(winNext, winOk);
  winBodyWrap.append(winBody, winButtons);
  winDialog.append(winBar, winBodyWrap);
  overlay.append(winDialog);

  frame.append(header, formulaRow, toolbar, table, ghostNote, banner, tabBar, statusBar);
  root.append(frame, overlay);

  const tabButtons: HTMLButtonElement[] = [];

  function updateTabs(tabs: readonly TabView[]): void {
    while (tabButtons.length < tabs.length) {
      const b = make(doc, 'button', 'tab');
      b.type = 'button';
      b.setAttribute('data-control', 'tab');
      tabBar.append(b);
      tabButtons.push(b);
    }
    while (tabButtons.length > tabs.length) {
      tabButtons.pop()?.remove();
    }
    tabs.forEach((tab, i) => {
      const b = tabButtons[i];
      if (!b) return;
      setAttr(b, 'data-level-index', String(tab.levelIndex));
      setText(b, tab.label);
      if (b.disabled !== !tab.enabled) b.disabled = !tab.enabled;
      setAttr(b, 'aria-current', tab.current ? 'page' : undefined);
    });
  }

  function update(vm: ViewModel): void {
    setAttr(root, 'data-screen', vm.screen);
    setAttr(root, 'data-beat', String(vm.beat));
    setAttr(table, 'data-damaged', vm.damaged ? 'true' : undefined);
    updateTabs(vm.tabs);

    if (vm.win) {
      setText(winTitle, vm.win.title);
      setText(winBody, vm.win.body);
      if (winNext.hidden !== !vm.win.hasNext) winNext.hidden = !vm.win.hasNext;
      setAttr(winNext, 'data-default', vm.win.hasNext ? '' : undefined);
      setAttr(winOk, 'data-default', vm.win.hasNext ? undefined : '');
    }

    setText(nameBox, vm.nameBox);
    if (formulaBar.value !== vm.formula.text) formulaBar.value = vm.formula.text;
    if (formulaBar.readOnly !== vm.formula.readOnly) formulaBar.readOnly = vm.formula.readOnly;
    setText(formulaNote, vm.formula.locked ? STRINGS.lockedText : '');
    setText(formulaAlert, vm.formula.alert);

    if (undoButton.disabled !== !vm.buttons.undoEnabled) undoButton.disabled = !vm.buttons.undoEnabled;
    if (recoverButton.disabled !== !vm.buttons.recoverEnabled) {
      recoverButton.disabled = !vm.buttons.recoverEnabled;
    }
    if (nextButton.hidden !== !vm.buttons.nextVisible) nextButton.hidden = !vm.buttons.nextVisible;

    for (const row of vm.rows) {
      for (const cell of row) {
        const parts = cells.get(cell.address);
        if (parts) updateCell(doc, parts, cell);
      }
    }
    setAttr(table, 'aria-activedescendant', `cell-${vm.activeCell}`);

    if (banner.hidden !== (vm.banner === undefined)) banner.hidden = vm.banner === undefined;
    setText(bannerTitle, vm.banner?.title ?? '');
    setText(bannerBody, vm.banner?.body ?? '');

    setText(statusLevel, vm.status.label);
    setText(statusHp, vm.status.hp);
    setText(statusInk, vm.status.ink);
    setText(statusTurn, vm.status.turn);
    setText(message, vm.message);

    setText(explanation, vm.explanation?.text ?? '');
    setAttr(explanation, 'data-error', vm.explanation?.kind);
    setAttr(explanation, 'title', vm.explanation?.text);
    const explanationHidden = vm.explanation === undefined;
    if (explanation.hidden !== explanationHidden) explanation.hidden = explanationHidden;

    setText(ghostNote, vm.ghostCells.length === 0 ? '' : STRINGS.ghostNote(vm.ghostCells.length));
  }

  let ghostAt: string | undefined;

  function setGhost(address: string | undefined): void {
    if (address === ghostAt) return;
    if (ghostAt !== undefined) {
      const prev = cells.get(ghostAt);
      if (prev) setAttr(prev.td, 'data-ghost', undefined);
    }
    if (address !== undefined) {
      const next = cells.get(address);
      if (next) setAttr(next.td, 'data-ghost', 'true');
    }
    ghostAt = address;
  }

  function setSound(on: boolean): void {
    setAttr(soundButton, 'aria-pressed', on ? 'true' : 'false');
  }

  function setWinDialog(open: boolean): void {
    if (winDialog.hidden !== !open) winDialog.hidden = !open;
  }

  let titleDialog: HTMLDivElement | undefined;

  function showTitle(): void {
    if (!titleDialog) {
      const dlg = make(doc, 'div', 'dialog title-dialog', 'title-dialog');
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-labelledby', 'title-heading');
      dlg.setAttribute('aria-describedby', 'title-premise');
      const bar = dialogTitleBar('dialog-title');
      (bar.firstElementChild as HTMLSpanElement).textContent = STRINGS.titleBar;
      const body = make(doc, 'div', 'dialog-body title-body');
      const heading = make(doc, 'h1', 'title-heading', 'title-heading');
      heading.textContent = STRINGS.titleBar;
      const tagline = make(doc, 'p', 'title-tagline');
      tagline.textContent = STRINGS.title.tagline;
      const premise = make(doc, 'p', 'title-premise', 'title-premise');
      premise.textContent = STRINGS.title.premise;
      const controls = make(doc, 'p', 'title-controls');
      controls.textContent = STRINGS.title.controls;
      const buttons = make(doc, 'div', 'dialog-buttons');
      const start = dialogButton('title-start', 'start', STRINGS.buttons.start);
      start.setAttribute('data-default', '');
      buttons.append(start);
      body.append(heading, tagline, premise, controls, buttons);
      dlg.append(bar, body);
      titleDialog = dlg;
    }
    if (!titleDialog.isConnected) overlay.append(titleDialog);
    setAttr(frame, 'inert', '');
  }

  function hideTitle(): void {
    titleDialog?.remove();
    titleDialog = undefined;
    setAttr(frame, 'inert', undefined);
  }

  return { update, setGhost, setSound, showTitle, hideTitle, setWinDialog };
}
