import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormulaError, evaluate } from '../src/formula.js';

test('the formulas of the register maps', () => {
  // Every shape found in the 27 register maps of the Home Assistant integration.
  const cases = [
    ['#', 21, 21],
    ['#/2', 37, 18.5],
    ['#*2', 18.5, 37],
    ['#+30', 82, 112],
    ['#-30', 112, 82],
    ['#/16', 32, 2],
    ['#+2000', 26, 2026],
    ['#*10+250', 3, 280],
    ['(# * 10)+250', 3, 280],
    ['(#-250)/10', 280, 3],
    ['5+#', 2, 7],
    ['5-#', 2, 3],
    ['(#-9)/2', 29, 10],
    ['(#*2 )+9', 10, 29],
    ['int(#/4)+1', 9, 3],
    ['int(#/4) +1', 9, 3],
    ['int(#*4)-1', 3, 11],
    ['(#-1)*4', 3, 8],
    ['(# + 3) * 10', 1, 40],
    ['(# - 3) / 10', 40, 3.7],
    ['#/16+2', 32, 4],
    ['int(#/80)', 37, 0],
    ['#/8192', 8192, 1],
  ];
  for (const [formula, value, expected] of cases) {
    assert.equal(evaluate(formula, value), expected, `${formula} with ${value}`);
  }
});

test('Python semantics: int() truncates, % and Mod follow the divisor, IF and comparisons', () => {
  assert.equal(evaluate('int(#)', -2.7), -2);
  assert.equal(evaluate('# Mod 256', 300), 44);
  assert.equal(evaluate('# % 7', -1), 6);
  assert.equal(evaluate('# // 4', 9), 2);
  assert.equal(evaluate('IF(#>100,#-256,#)', 250), -6);
  assert.equal(evaluate('IF(#>100,#-256,#)', 20), 20);
  assert.equal(evaluate('IF(# == 0, 1, 2)', 0), 1);
  assert.equal(evaluate('-#', -5), 5);
  assert.equal(evaluate(undefined, 7), 7, 'no formula means the value itself');
});

test('anything else is refused, never run', () => {
  for (const formula of [
    'process.exit()',
    '#; 1',
    'eval(#)',
    '__import__("os")',
    '#**2',
    '(#',
    '#/0',
    'int()',
    'IF(1, 2)',
    '#'.repeat(201),
  ]) {
    assert.throws(() => evaluate(formula, 1), FormulaError, formula);
  }
  assert.throws(() => evaluate('#', Number.NaN), FormulaError);
});
