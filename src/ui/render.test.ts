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
    cause: undefined,
    name: undefined,
    locked: false,
    entity: undefined,
    selected: false,
    changed: false,
    ariaLabel: undefined,
    slide: undefined,
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
    explanation: undefined,
    ghostCells: [],
    beat: 0,
    damaged: false,
    win: undefined,
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
    expect(root.querySelector('#end-banner')?.getAttribute('role')).toBe('alertdialog');
    expect(root.querySelector('#screen-overlay')?.childElementCount).toBe(1);
    const msg = root.querySelector('#message');
    expect(msg?.getAttribute('role')).toBe('status');
    expect(msg?.getAttribute('aria-live')).toBe('polite');
    expect(msg?.textContent).toBe('Walk to the exit.');
    expect(root.querySelector('[data-control="undo"]')?.textContent).toBe('Undo');
    expect(root.querySelector('[data-control="recover"]')?.textContent).toBe('Recover');
  });
});

describe('fixed column widths', () => {
  it('declares a colgroup of 13 classed columns first in the table, with widths set in the stylesheet', () => {
    const root = document.createElement('div');
    document.body.append(root);
    createView(root);
    const table = root.querySelector('#grid-table');
    const cols = Array.from(table?.querySelectorAll('colgroup > col') ?? []);
    // One column for the row headers plus A to L.
    expect(cols).toHaveLength(13);
    expect(cols[0]?.className).toBe('col-row-header');
    expect(cols[1]?.className).toBe('col-label');
    expect(cols.slice(2).every((c) => c.className === 'col-cell')).toBe(true);
    expect(cols.slice(2)).toHaveLength(11);
    // The colgroup comes first, so a table-layout: fixed table reads its widths from it.
    expect(table?.firstElementChild?.tagName).toBe('COLGROUP');
    root.remove();

    const css = readFileSync('src/styles/grid-ui.css', 'utf8');
    expect(css).toMatch(/col\.col-row-header\s*\{[^}]*width:\s*\d/);
    expect(css).toMatch(/col\.col-label\s*\{[^}]*width:\s*7\.5rem/);
    expect(css).toMatch(/col\.col-cell\s*\{[^}]*width:\s*\d/);
  });

  it('gives the table an explicit width in the stylesheet, so table-layout: fixed applies', () => {
    const css = readFileSync('src/styles/grid-ui.css', 'utf8');
    const block = /\.grid-table\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/table-layout:\s*fixed/);
    expect(block).toMatch(/(^|[;\s])width:\s*38rem/);
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
    expect(a1.querySelector('.padlock')).toBeNull();
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

  it('sets title for an error cell and removes it when the cell stops being an error', () => {
    const view = createView(root);
    view.update(makeVm({ B9: { errorKind: '#REF!', text: '#REF!', cause: 'B9 refers to M30, which does not exist' } }));
    const b9 = td('B9');
    expect(b9.getAttribute('title')).toBe('B9 refers to M30, which does not exist');
    view.update(makeVm());
    expect(b9.hasAttribute('title')).toBe(false);
  });

  it('shows a cause with markup as text and creates no element', () => {
    createView(root).update(
      makeVm({ A1: { errorKind: '#VALUE!', text: '#VALUE!', cause: '<img onerror=x>' } }),
    );
    const a1 = td('A1');
    expect(a1.getAttribute('title')).toBe('<img onerror=x>');
    expect(a1.querySelector('img')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
  });

  it('keeps the glyph, aria-label and title on an error cell under an entity', () => {
    createView(root).update(
      makeVm({
        B9: {
          errorKind: '#CYCLE!',
          text: '#CYCLE!',
          cause: 'B9 is part of a circular reference',
          entity: { type: 'monster', id: 'M1' },
          ariaLabel: 'Monster M1 at B9',
        },
      }),
    );
    const b9 = td('B9');
    expect(b9.querySelector('.entity-glyph')?.textContent).toBe('M');
    expect(b9.getAttribute('aria-label')).toBe('Monster M1 at B9');
    expect(b9.getAttribute('title')).toBe('B9 is part of a circular reference');
  });
});

describe('explanation line', () => {
  it('has no role and no aria-live and sits in the toolbar row, not the formula row', () => {
    createView(root).update(makeVm());
    const explanation = root.querySelector('#cell-explanation');
    expect(explanation?.hasAttribute('role')).toBe(false);
    expect(explanation?.hasAttribute('aria-live')).toBe(false);
    expect(explanation?.classList.contains('cell-explanation')).toBe(true);
    // A line of its own in the formula row made the window taller (layout shift); the toolbar row has room.
    expect(explanation?.parentElement?.classList.contains('toolbar')).toBe(true);
    expect(root.querySelector('.formula-row #cell-explanation')).toBeNull();
  });

  it('keeps the full text in the title while shown and drops it when hidden', () => {
    const view = createView(root);
    view.update(makeVm({}, { explanation: { text: 'B15 (RATIO) divides by zero', kind: '#DIV/0!' } }));
    const shown = root.querySelector<HTMLElement>('#cell-explanation');
    expect(shown?.hidden).toBe(false);
    expect(shown?.getAttribute('title')).toBe('B15 (RATIO) divides by zero');
    view.update(makeVm());
    expect(shown?.hidden).toBe(true);
    expect(shown?.hasAttribute('title')).toBe(false);
  });

  it('fills text, data-error and hidden from the view model', () => {
    const view = createView(root);
    view.update(makeVm());
    const explanation = root.querySelector<HTMLElement>('#cell-explanation');
    expect(explanation?.hidden).toBe(true);
    expect(explanation?.textContent).toBe('');
    expect(explanation?.hasAttribute('data-error')).toBe(false);
    view.update(
      makeVm({}, { explanation: { text: 'B9 refers to M30, which does not exist', kind: '#REF!' } }),
    );
    expect(explanation?.hidden).toBe(false);
    expect(explanation?.textContent).toBe('B9 refers to M30, which does not exist');
    expect(explanation?.getAttribute('data-error')).toBe('#REF!');
    view.update(makeVm());
    expect(explanation?.hidden).toBe(true);
    expect(explanation?.textContent).toBe('');
    expect(explanation?.hasAttribute('data-error')).toBe(false);
  });

  it('extends the formula bar aria-describedby', () => {
    createView(root).update(makeVm());
    expect(root.querySelector('#formula-bar')?.getAttribute('aria-describedby')).toBe(
      'formula-note formula-alert cell-explanation',
    );
  });
});

describe('ghost note', () => {
  it('has no role and no aria-live and the table describes it', () => {
    createView(root).update(makeVm());
    const note = root.querySelector('#ghost-note');
    expect(note?.hasAttribute('role')).toBe(false);
    expect(note?.hasAttribute('aria-live')).toBe(false);
    expect(root.querySelector('#grid-table')?.getAttribute('aria-describedby')).toBe('ghost-note');
  });

  it('is singular, plural and emptied', () => {
    const view = createView(root);
    const note = root.querySelector('#ghost-note');
    view.update(makeVm({}, { ghostCells: ['J9'] }));
    expect(note?.textContent).toBe(STRINGS.ghostNote(1));
    view.update(makeVm({}, { ghostCells: ['J9', 'K9'] }));
    expect(note?.textContent).toBe(STRINGS.ghostNote(2));
    view.update(makeVm());
    expect(note?.textContent).toBe('');
  });
});

describe('setGhost', () => {
  it('moves the attribute and leaves exactly one [data-ghost]', () => {
    const view = createView(root);
    view.update(makeVm());
    view.setGhost('J9');
    expect(root.querySelectorAll('[data-ghost]')).toHaveLength(1);
    expect(td('J9').getAttribute('data-ghost')).toBe('true');
    view.setGhost('K9');
    expect(root.querySelectorAll('[data-ghost]')).toHaveLength(1);
    expect(td('K9').getAttribute('data-ghost')).toBe('true');
    expect(td('J9').hasAttribute('data-ghost')).toBe(false);
  });

  it('removes the attribute for undefined', () => {
    const view = createView(root);
    view.update(makeVm());
    view.setGhost('J9');
    view.setGhost(undefined);
    expect(root.querySelectorAll('[data-ghost]')).toHaveLength(0);
  });

  it('ignores an unknown address', () => {
    const view = createView(root);
    view.update(makeVm());
    view.setGhost('ZZ99');
    expect(root.querySelectorAll('[data-ghost]')).toHaveLength(0);
  });

  it('is left alone by a subsequent update()', () => {
    const view = createView(root);
    view.update(makeVm());
    view.setGhost('J9');
    view.update(makeVm({}, { ghostCells: ['J9', 'K9'] }));
    expect(td('J9').getAttribute('data-ghost')).toBe('true');
    expect(root.querySelectorAll('[data-ghost]')).toHaveLength(1);
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

function ids(parent: Element): string[] {
  return Array.from(parent.children).map((c) => c.id || c.tagName.toLowerCase());
}

describe('window skeleton', () => {
  it('has the window and overlay as the only root children, in order', () => {
    createView(root).update(makeVm());
    expect(ids(root)).toEqual(['window', 'screen-overlay']);
    expect(root.classList.contains('grimsheet-app')).toBe(true);
    const frame = root.querySelector('#window');
    expect(frame?.classList.contains('window')).toBe(true);
    expect(Array.from(frame?.children ?? []).map((c) => c.className || c.tagName)).toEqual([
      'title-bar',
      'formula-row',
      'toolbar',
      'grid-table',
      'visually-hidden',
      'end-banner dialog',
      'tab-bar',
      'status-bar',
    ]);
  });

  it('has three decorative window buttons with no tabindex', () => {
    createView(root).update(makeVm());
    const group = root.querySelector('.title-bar .window-buttons');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    const wbs = group?.querySelectorAll('.wb') ?? [];
    expect(wbs).toHaveLength(3);
    for (const wb of wbs) expect(wb.hasAttribute('tabindex')).toBe(false);
  });

  it('puts the sound toggle in the toolbar and flips aria-pressed', () => {
    const view = createView(root);
    const sound = root.querySelector('.toolbar [data-control="sound"]');
    expect(sound?.getAttribute('type')).toBe('button');
    expect(sound?.getAttribute('aria-pressed')).toBe('true');
    view.setSound(false);
    expect(sound?.getAttribute('aria-pressed')).toBe('false');
    view.setSound(true);
    expect(sound?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('padlock', () => {
  it('is not drawn on a locked map cell but locked attributes stay', () => {
    createView(root).update(makeVm({ B3: { locked: true } }));
    expect(td('B3').querySelector('.padlock')).toBeNull();
    expect(td('B3').dataset['locked']).toBe('true');
    expect(td('B3').getAttribute('aria-readonly')).toBe('true');
  });

  it('is an empty aria-hidden span on a locked rules cell and is removed when unlocked', () => {
    const view = createView(root);
    view.update(makeVm({ B14: { locked: true } }));
    const lock = td('B14').querySelector('.padlock');
    expect(lock?.getAttribute('aria-hidden')).toBe('true');
    expect(lock?.textContent).toBe('');
    view.update(makeVm());
    expect(td('B14').querySelector('.padlock')).toBeNull();
  });
});

describe('effects attributes', () => {
  it('writes and removes data-beat, data-damaged and data-slide', () => {
    const view = createView(root);
    const hero = { entity: { type: 'hero' } as const, slide: 'E' as const };
    view.update(makeVm({ C3: hero, D3: { entity: { type: 'monster', id: 'M1' }, slide: 'W' } }, { beat: 1, damaged: true }));
    expect(root.dataset['beat']).toBe('1');
    expect(root.querySelector('#grid-table')?.getAttribute('data-damaged')).toBe('true');
    expect(td('C3').querySelector('.entity-glyph')?.getAttribute('data-slide')).toBe('E');
    expect(td('D3').querySelector('.entity-glyph')?.hasAttribute('data-slide')).toBe(false);
    view.update(makeVm({ C3: { entity: { type: 'hero' } } }, { beat: 0 }));
    expect(root.dataset['beat']).toBe('0');
    expect(root.querySelector('#grid-table')?.hasAttribute('data-damaged')).toBe(false);
    expect(td('C3').querySelector('.entity-glyph')?.hasAttribute('data-slide')).toBe(false);
  });
});

describe('dialogs', () => {
  it('makes the death dialog an alertdialog with resolving references and one recover control', () => {
    const view = createView(root);
    view.update(
      makeVm({}, { screen: 'lost', banner: { kind: 'lost', title: STRINGS.lostTitle, body: STRINGS.lostBody } }),
    );
    const banner = root.querySelector('#end-banner');
    expect(banner?.getAttribute('role')).toBe('alertdialog');
    for (const attr of ['aria-labelledby', 'aria-describedby']) {
      const id = banner?.getAttribute(attr) ?? '';
      expect(banner?.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(root.querySelector('#banner-title')?.textContent).toBe(STRINGS.lostTitle);
    expect(root.querySelector('#banner-body')?.textContent).toBe(STRINGS.lostBody);
    const btn = root.querySelector('#end-recover');
    expect(btn?.getAttribute('data-control')).toBe('recover-dialog');
    expect(btn?.hasAttribute('data-default')).toBe(true);
    expect(root.querySelectorAll('[data-control="recover"]')).toHaveLength(1);
  });

  it('fills the win dialog for hasNext true and false', () => {
    const view = createView(root);
    const next = root.querySelector<HTMLElement>('#win-next');
    const ok = root.querySelector<HTMLElement>('#win-ok');
    view.update(makeVm({}, { screen: 'won', win: { title: 'T1', body: STRINGS.won, hasNext: true } }));
    expect(root.querySelector('#win-title')?.textContent).toBe('T1');
    expect(root.querySelector('#win-body')?.textContent).toBe(STRINGS.won);
    expect(next?.hidden).toBe(false);
    expect(next?.hasAttribute('data-default')).toBe(true);
    expect(ok?.hasAttribute('data-default')).toBe(false);
    view.update(makeVm({}, { screen: 'won', win: { title: 'T2', body: STRINGS.wonLast, hasNext: false } }));
    expect(root.querySelector('#win-body')?.textContent).toBe(STRINGS.wonLast);
    expect(next?.hidden).toBe(true);
    expect(next?.hasAttribute('data-default')).toBe(false);
    expect(ok?.hasAttribute('data-default')).toBe(true);
    expect(next?.getAttribute('data-control')).toBe('win-next');
    expect(ok?.getAttribute('data-control')).toBe('win-ok');
  });

  it('shows markup in a win title as text and toggles hidden with setWinDialog', () => {
    const view = createView(root);
    view.update(makeVm({}, { win: { title: '<b>x</b>', body: 'y', hasNext: false } }));
    expect(root.querySelector('#win-title')?.textContent).toBe('<b>x</b>');
    expect(root.querySelector('#win-title b')).toBeNull();
    const dlg = root.querySelector<HTMLElement>('#win-dialog');
    expect(dlg?.hidden).toBe(true);
    view.setWinDialog(true);
    expect(dlg?.hidden).toBe(false);
    view.setWinDialog(false);
    expect(dlg?.hidden).toBe(true);
  });

  it('adds and removes the title dialog and inert', () => {
    const view = createView(root);
    view.update(makeVm());
    const overlay = root.querySelector('#screen-overlay');
    expect(overlay?.children).toHaveLength(1);
    expect(overlay?.firstElementChild?.id).toBe('win-dialog');
    view.showTitle();
    view.showTitle();
    const dlg = root.querySelector('#title-dialog');
    expect(overlay?.querySelectorAll('#title-dialog')).toHaveLength(1);
    expect(dlg?.getAttribute('role')).toBe('dialog');
    expect(dlg?.getAttribute('aria-modal')).toBe('true');
    expect(dlg?.querySelector('#title-start')?.getAttribute('data-control')).toBe('start');
    expect(root.querySelector('#window')?.hasAttribute('inert')).toBe(true);
    view.hideTitle();
    expect(root.querySelector('#title-dialog')).toBeNull();
    expect(root.querySelector('#window')?.hasAttribute('inert')).toBe(false);
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
