import type { ErrorKind } from '../engine/index';
import { STRINGS } from './strings';
import type { CellView, TabView, ViewModel } from './types';

/** Error kind to the CSS class that styles its monster. The view model carries the kind only. */
export const ERROR_CLASS: Readonly<Record<ErrorKind, string>> = {
  '#REF!': 'cell-error-ref',
  '#NAME?': 'cell-error-name',
  '#DIV/0!': 'cell-error-div0',
  '#VALUE!': 'cell-error-value',
  '#CYCLE!': 'cell-error-cycle',
};

export interface View {
  update(viewModel: ViewModel): void;
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

  // Padlock: present only when locked.
  if (!cell.locked) {
    if (parts.padlock) {
      parts.padlock.remove();
      parts.padlock = undefined;
    }
  } else if (!parts.padlock) {
    const padlock = make(doc, 'span', 'padlock');
    padlock.setAttribute('aria-hidden', 'true');
    padlock.textContent = STRINGS.padlock;
    td.append(padlock);
    parts.padlock = padlock;
  }
}

export function createView(root: HTMLElement): View {
  const doc = root.ownerDocument;
  const cells = new Map<string, CellParts>();

  root.classList.add('grimsheet-app');
  root.textContent = '';

  const header = make(doc, 'header', 'title-bar');
  const titleText = make(doc, 'span', 'title-text');
  titleText.textContent = STRINGS.titleBar;
  header.append(titleText);

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
  formulaBar.setAttribute('aria-describedby', 'formula-note formula-alert');
  const formulaNote = make(doc, 'span', 'formula-note', 'formula-note');
  const formulaAlert = make(doc, 'span', 'formula-alert', 'formula-alert');
  formulaAlert.setAttribute('role', 'alert');
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
  toolbar.append(undoButton, recoverButton, nextButton);

  const table = make(doc, 'table', 'grid-table', 'grid-table');
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', STRINGS.gridLabel);
  table.setAttribute('tabindex', '0');

  // Fixed column widths live in the stylesheet (the view never sets a style attribute). The stylesheet
  // also gives the table an explicit width, so table-layout: fixed applies and a long cell text is
  // clipped instead of widening its column.
  const colgroup = make(doc, 'colgroup');
  colgroup.append(make(doc, 'col', 'col-row-header'));
  for (let col = 1; col <= COLUMNS; col++) {
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

  const banner = make(doc, 'div', 'end-banner', 'end-banner');
  banner.setAttribute('role', 'alert');
  banner.hidden = true;
  const bannerTitle = make(doc, 'p', 'banner-title');
  const bannerBody = make(doc, 'p', 'banner-body');
  banner.append(bannerTitle, bannerBody);

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

  root.append(header, tabBar, formulaRow, toolbar, table, banner, statusBar, overlay);

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
    updateTabs(vm.tabs);

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
  }

  return { update };
}
