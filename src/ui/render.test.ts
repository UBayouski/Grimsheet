// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorKind } from '../engine/index';
import { createView, ERROR_CLASS } from './render';
import { STRINGS } from './strings';
import type { CellView, ViewModel } from './types';

const KINDS: readonly ErrorKind[] = ['#REF!', '#NAME?', '#DIV/0!', '#VALUE!', '#CYCLE!'];
const LETTERS = 'ABCDEFGHIJKL';

function cell(row: number, col: number, over: Partial<CellView> = {}): CellView {
  return {
    address: `${LETTERS[col - 1]}${row}`,
    row,
    col,
    region: row < 13 ? 'map' : 'rules',
    text: '.',
    errorKind: undefined,
    name: undefined,
    locked: false,
    entity: undefined,
    selected: false,
    changed: false,
    ariaLabel: undefined,
    ...over,
  };
}

function makeVm(
  overrides: Readonly<Record<string, Partial<CellView>>> = {},
  vmOver: Partial<ViewModel> = {},
): ViewModel {
  const rows: CellView[][] = [];
  for (let row = 1; row <= 20; row++) {
    if (row === 13) continue;
    const r: CellView[] = [];
    for (let col = 1; col <= 12; col++) {
      const address = `${LETTERS[col - 1]}${row}`;
      r.push(cell(row, col, overrides[address]));
    }
    rows.push(r);
  }
  return {
    screen: 'playing',
    tabs: [
      { levelIndex: 0, label: 'Sheet1: A', current: true, enabled: true },
      { levelIndex: 1, label: 'Sheet2: B', current: false, enabled: false },
    ],
    nameBox: 'B3',
    formula: { text: '=1+1', readOnly: false, locked: false, alert: '' },
    status: { label: 'Sheet1: A', hp: 'HP 5/5', ink: 'Ink 3/3', turn: 'Turn 0' },
    message: 'Walk to the exit.',
    banner: undefined,
    buttons: { undoEnabled: true, recoverEnabled: true, nextVisible: false },
    activeCell: 'B3',
    rows,
    ...vmOver,
  };
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
});

function td(address: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`#cell-${address}`);
  if (!el) throw new Error(`missing ${address}`);
  return el;
}

describe('skeleton', () => {
  it('builds 228 cells, one separator, 12 column headers and 20 row headers', () => {
    createView(root).update(makeVm());
    expect(root.querySelectorAll('[data-address]')).toHaveLength(228);
    const sep = root.querySelectorAll('[data-separator="true"]');
    expect(sep).toHaveLength(1);
    expect(sep[0]?.getAttribute('colspan')).toBe('12');
    expect(sep[0]?.hasAttribute('data-address')).toBe(false);
    expect(sep[0]?.textContent).toBe(STRINGS.panelTitle);
    expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(12);
    expect(root.querySelectorAll('[role="rowheader"]')).toHaveLength(20);
  });

  it('sets static cell attributes', () => {
    createView(root).update(makeVm());
    const a1 = td('A1');
    expect(a1.getAttribute('role')).toBe('gridcell');
    expect(a1.dataset['row']).toBe('1');
    expect(a1.dataset['col']).toBe('A');
    expect(a1.dataset['region']).toBe('map');
    expect(td('L20').dataset['region']).toBe('rules');
  });

  it('has the chrome elements and roles', () => {
    createView(root).update(makeVm());
    expect(root.querySelector('.title-text')?.textContent).toBe('GRIMSHEET.XLS');
    const table = root.querySelector('#grid-table');
    expect(table?.getAttribute('role')).toBe('grid');
    expect(table?.getAttribute('tabindex')).toBe('0');
    expect(table?.getAttribute('aria-label')).toBe(STRINGS.gridLabel);
    expect(root.querySelector('#formula-alert')?.getAttribute('role')).toBe('alert');
    expect(root.querySelector('#end-banner')?.getAttribute('role')).toBe('alert');
    expect(root.querySelector('#screen-overlay')?.childElementCount).toBe(0);
    const msg = root.querySelector('#message');
    expect(msg?.getAttribute('role')).toBe('status');
    expect(msg?.getAttribute('aria-live')).toBe('polite');
    expect(msg?.textContent).toBe('Walk to the exit.');
    expect(root.querySelector('[data-control="undo"]')?.textContent).toBe('Undo');
    expect(root.querySelector('[data-control="recover"]')?.textContent).toBe('Recover');
  });
});

describe('cell attributes', () => {
  it('writes name, locked, selected, changed and entity', () => {
    createView(root).update(
      makeVm({
        B3: {
          name: 'HP',
          locked: true,
          selected: true,
          changed: true,
          entity: { type: 'monster', id: 'M1' },
          ariaLabel: 'Monster M1 at B3 on floor',
        },
        C3: { entity: { type: 'hero' } },
      }),
    );
    const b3 = td('B3');
    expect(b3.dataset['name']).toBe('HP');
    expect(b3.dataset['locked']).toBe('true');
    expect(b3.getAttribute('aria-readonly')).toBe('true');
    expect(b3.dataset['selected']).toBe('true');
    expect(b3.getAttribute('aria-selected')).toBe('true');
    expect(b3.dataset['changed']).toBe('true');
    expect(b3.dataset['entity']).toBe('monster');
    expect(b3.dataset['monsterId']).toBe('M1');
    expect(b3.getAttribute('aria-label')).toBe('Monster M1 at B3 on floor');
    expect(td('C3').dataset['entity']).toBe('hero');
    expect(td('C3').hasAttribute('data-monster-id')).toBe(false);
    expect(root.querySelectorAll('[data-selected]')).toHaveLength(1);
    expect(root.querySelector('#grid-table')?.getAttribute('aria-activedescendant')).toBe('cell-B3');
  });

  it('maps all five error kinds to classes', () => {
    expect(ERROR_CLASS).toEqual({
      '#REF!': 'cell-error-ref',
      '#NAME?': 'cell-error-name',
      '#DIV/0!': 'cell-error-div0',
      '#VALUE!': 'cell-error-value',
      '#CYCLE!': 'cell-error-cycle',
    });
    const overrides: Record<string, Partial<CellView>> = {};
    KINDS.forEach((kind, i) => {
      overrides[`${LETTERS[i]}1`] = { errorKind: kind, text: kind };
    });
    createView(root).update(makeVm(overrides));
    KINDS.forEach((kind, i) => {
      const el = td(`${LETTERS[i]}1`);
      expect(el.dataset['error']).toBe(kind);
      expect(el.classList.contains('cell-error')).toBe(true);
      expect(el.classList.contains(ERROR_CLASS[kind])).toBe(true);
      expect(el.querySelector('.cell-text')?.textContent).toBe(kind);
    });
    expect(td('A2').classList.contains('cell-error')).toBe(false);
  });

  it('does not map an unknown error kind', () => {
    const unknown = '#BOGUS!' as ErrorKind;
    expect((ERROR_CLASS as Record<string, string>)[unknown]).toBeUndefined();
    createView(root).update(makeVm({ A1: { errorKind: unknown } }));
    const classes = [...td('A1').classList].filter((c) => c.startsWith('cell-error-'));
    expect(classes).toEqual([]);
  });

  it('adds and removes glyph, padlock and label on a second update', () => {
    const view = createView(root);
    view.update(
      makeVm({ A1: { entity: { type: 'hero' }, locked: true, ariaLabel: 'Hero at A1 on floor' } }),
    );
    const a1 = td('A1');
    expect(a1.querySelector('.entity-glyph')?.textContent).toBe('@');
    expect(a1.querySelector('.padlock')?.textContent).toBe(STRINGS.padlock);
    expect(a1.getAttribute('aria-label')).toBe('Hero at A1 on floor');
    view.update(makeVm());
    expect(a1.querySelector('.entity-glyph')).toBeNull();
    expect(a1.querySelector('.padlock')).toBeNull();
    expect(a1.hasAttribute('aria-label')).toBe(false);
    expect(a1.hasAttribute('data-locked')).toBe(false);
    expect(a1.querySelector('.cell-text')).not.toBeNull();
  });

  it('puts text in .cell-text as text only', () => {
    createView(root).update(makeVm({ A1: { text: '<b>x</b>' } }));
    const a1 = td('A1');
    expect(a1.querySelector('.cell-text')?.textContent).toBe('<b>x</b>');
    expect(a1.querySelector('b')).toBeNull();
  });
});

describe('chrome', () => {
  it('renders tab buttons with disabled and aria-current', () => {
    createView(root).update(makeVm());
    const tabs = root.querySelectorAll<HTMLButtonElement>('[data-control="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.disabled).toBe(false);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
    expect(tabs[0]?.textContent).toBe('Sheet1: A');
    expect(tabs[1]?.disabled).toBe(true);
    expect(tabs[1]?.hasAttribute('aria-current')).toBe(false);
    expect(tabs[1]?.dataset['levelIndex']).toBe('1');
  });

  it('shows the banner only for the lost screen', () => {
    const view = createView(root);
    const banner = root.querySelector<HTMLElement>('#end-banner');
    view.update(makeVm());
    expect(banner?.hidden).toBe(true);
    view.update(
      makeVm({}, {
        screen: 'lost',
        banner: { kind: 'lost', title: STRINGS.lostTitle, body: STRINGS.lostBody },
      }),
    );
    expect(banner?.hidden).toBe(false);
    expect(banner?.textContent).toContain(STRINGS.lostBody);
    view.update(makeVm({}, { screen: 'won' }));
    expect(banner?.hidden).toBe(true);
  });

  it('sets formula bar readOnly, the locked note and the alert', () => {
    const view = createView(root);
    view.update(makeVm({}, { formula: { text: '=A1', readOnly: true, locked: true, alert: 'Col 3: bad.' } }));
    const bar = root.querySelector<HTMLInputElement>('#formula-bar');
    expect(bar?.value).toBe('=A1');
    expect(bar?.readOnly).toBe(true);
    expect(root.querySelector('#formula-note')?.textContent).toBe(STRINGS.lockedText);
    expect(root.querySelector('#formula-alert')?.textContent).toBe('Col 3: bad.');
    view.update(makeVm());
    expect(bar?.readOnly).toBe(false);
    expect(root.querySelector('#formula-note')?.textContent).toBe('');
  });

  it('does not rewrite the formula bar value when it already equals the text', () => {
    const view = createView(root);
    view.update(makeVm());
    const bar = root.querySelector<HTMLInputElement>('#formula-bar');
    if (!bar) throw new Error('no bar');
    bar.value = '=1+1';
    bar.setSelectionRange(2, 2);
    view.update(makeVm());
    expect(bar.selectionStart).toBe(2);
  });

  it('sets data-screen and the status bar', () => {
    const view = createView(root);
    view.update(makeVm({}, { screen: 'won' }));
    expect(root.dataset['screen']).toBe('won');
    expect(root.querySelector('.status-hp')?.textContent).toBe('HP 5/5');
    expect(root.querySelector('.status-ink')?.textContent).toBe('Ink 3/3');
    expect(root.querySelector('.status-turn')?.textContent).toBe('Turn 0');
    expect(root.querySelector('.status-level')?.textContent).toBe('Sheet1: A');
  });

  it('sets button states', () => {
    createView(root).update(
      makeVm({}, { buttons: { undoEnabled: false, recoverEnabled: false, nextVisible: true } }),
    );
    expect(root.querySelector<HTMLButtonElement>('[data-control="undo"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-control="recover"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-control="next"]')?.hidden).toBe(false);
  });

  it('gives equal HTML for the same view model twice', () => {
    const view = createView(root);
    const vm = makeVm({ A1: { entity: { type: 'hero' }, locked: true, name: 'HP' } });
    view.update(vm);
    const first = root.outerHTML;
    view.update(vm);
    expect(root.outerHTML).toBe(first);
  });

  it('never sets a style attribute', () => {
    createView(root).update(makeVm({ A1: { entity: { type: 'hero' }, locked: true } }));
    expect(root.querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('grid-ui.css', () => {
  const css = readFileSync('src/styles/grid-ui.css', 'utf8');
  it('has no url(, @import or http', () => {
    expect(css).not.toContain('url(');
    expect(css).not.toContain('@import');
    expect(css).not.toContain('http');
  });
  it('honors reduced motion and has a focus style', () => {
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain(':focus-visible');
  });
});
