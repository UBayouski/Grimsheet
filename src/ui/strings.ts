export const STRINGS = {
  titleBar: 'GRIMSHEET.XLS',
  panelTitle: 'NECRONOMICELL',
  tabBarLabel: 'Levels',
  gridLabel: 'Grimsheet workbook',
  nameBoxLabel: 'Selected cell',
  formulaBarLabel: 'Formula bar',
  lockedText: 'This cell is locked and cannot be edited.',
  buttons: {
    undo: 'Undo',
    recover: 'Recover',
    next: 'Next level',
    ok: 'OK',
    sound: 'Sound',
    start: 'Start',
  },
  title: {
    tagline: 'A roguelike where every monster is a formula.',
    premise: "A workbook found on a dead accountant's floppy disk. Its formulas are alive.",
    controls:
      'Arrows move. Space waits. Ctrl+Arrows pick a cell. Enter edits it. U undoes. R restarts.',
  },
  status: {
    hp: 'HP',
    ink: 'Ink',
    turn: 'Turn',
  },
  edited: 'Edited.',
  undone: 'Undone.',
  loadFailed: 'This level could not be loaded.',
  somethingWrong: 'Something went wrong.',
  won: 'Changes saved.',
  wonLast: 'Workbook saved. Your soul was not.',
  lostTitle: '#REF! of the Dead',
  lostBody: 'GRIMSHEET.XLS has stopped responding',
  confirmRestart: 'Restart this level? Press R or Enter to confirm, Escape to cancel.',
  confirmSwitch: (label: string): string =>
    `Switch to ${label}? Press Enter to confirm, Escape to cancel.`,
  damage: {
    total: (n: number): string => `-${n} HP`,
    monster: (id: string): string => `${id} hit you`,
    trap: 'trap',
    haunt: 'haunted',
  },
  entity: {
    hero: 'Hero',
    monster: (id: string): string => `Monster ${id}`,
  },
  terrain: {
    floor: 'floor',
    wall: 'wall',
    exit: 'exit',
    trap: 'trap',
    empty: 'empty',
  },
  unreadableLevel: 'Unreadable level',
  errorCauseFallback: 'This cell holds an error, but its cause could not be read.',
  ghostNote: (count: number): string =>
    count === 1
      ? 'A ghost haunts the one cell of a circular reference.'
      : `A ghost drifts along ${count} cells of a circular reference.`,
} as const;
