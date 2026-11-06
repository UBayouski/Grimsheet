import { describe, expect, it } from 'vitest';
import * as engine from './index';

const EXPECTED_EXPORTS = [
  'MAX_DEPTH',
  'createSheet',
  'describeError',
  'evaluateCell',
  'formatAddress',
  'formatNumber',
  'formatValue',
  'getValueByAddress',
  'getValueByName',
  'isRuleAst',
  'listCycleCells',
  'parseAddress',
  'parseFormula',
  'printFormula',
  'recalculate',
  'setCellName',
  'setRawText',
  'tokenize',
  'validateCellName',
];

describe('engine public API', () => {
  it('exports exactly the expected runtime names', () => {
    expect(Object.keys(engine).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('has no default export', () => {
    expect('default' in engine).toBe(false);
  });

  it('runs an end-to-end flow', () => {
    const sheet = engine.createSheet();
    expect(engine.setRawText(sheet, 'A1', '3').accepted).toBe(true);
    expect(engine.setRawText(sheet, 'A2', '=A1*2').accepted).toBe(true);
    expect(engine.setCellName(sheet, 'A2', 'DOUBLE').accepted).toBe(true);
    const rule = '=IF(DIST(HERO, SELF) < 4, TOWARD(HERO), "-")';
    expect(engine.setRawText(sheet, 'A3', rule).accepted).toBe(true);
    expect(engine.setRawText(sheet, 'B1', '=B1+1').accepted).toBe(true);

    const ctx = {
      heroAddress: { col: 1, row: 1 },
      selfAddress: { col: 1, row: 3 },
      random: () => 0.5,
    };
    expect(engine.recalculate(sheet, ctx).accepted).toBe(true);

    const a2 = engine.getValueByAddress(sheet, 'A2');
    expect(a2).toMatchObject({ ok: true, value: { kind: 'number', value: 6 }, stale: false });
    const byName = engine.getValueByName(sheet, 'DOUBLE');
    expect(byName).toMatchObject({ ok: true, address: 'A2', value: { kind: 'number', value: 6 } });
    expect(engine.getValueByAddress(sheet, 'A3')).toMatchObject({
      ok: true,
      value: { kind: 'rule', text: rule },
    });

    const evaluated = engine.evaluateCell(sheet, { address: 'A3' }, ctx);
    expect(evaluated).toMatchObject({ ok: true, source: 'evaluated', value: { kind: 'string', value: 'N' } });

    expect(engine.listCycleCells(sheet)).toEqual(['B1']);
    expect(engine.describeError(sheet, { address: 'B1' })).toMatchObject({
      ok: true,
      description: { kind: '#CYCLE!', origin: 'B1' },
    });
  });
});
