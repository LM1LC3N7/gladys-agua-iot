import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Snapshot, bufferOf, encodeWrite, registersOf } from '../src/registers.js';
import { STOVE_NAMES, loadStove, registersByKey, snapshotOf } from './helpers/fixtures.js';

test('every value matches what the Python library computes', () => {
  assert.ok(STOVE_NAMES.length >= 7);
  for (const name of STOVE_NAMES) {
    const fixture = loadStove(name);
    const snapshot = snapshotOf(name);
    for (const [key, expected] of Object.entries(fixture.expected)) {
      assert.equal(snapshot.value(key), expected, `${name}: ${key}`);
    }
  }
});

test('registersOf keeps the map of the stove, keyed in lowercase', () => {
  const answer = {
    device_registers_map: {
      registers_map: [
        { id: 1, registers: [{ reg_key: 'other_get', offset: 1 }] },
        { id: 7, registers: [{ reg_key: 'Status_Get', offset: 33 }, { offset: 2 }] },
      ],
    },
  };
  assert.deepEqual(Object.keys(registersOf(answer, 7)), ['status_get']);
  assert.deepEqual(registersOf(answer, '7'), registersOf(answer, 7), 'the id type does not matter');
  assert.throws(() => registersOf({}, 7), /unexpected register map/);
});

test('bufferOf pairs offsets and words, and refuses a broken answer', () => {
  assert.deepEqual(
    bufferOf({ Items: [1, '33'], Values: [40, 4] }),
    new Map([
      [1, 40],
      [33, 4],
    ]),
  );
  assert.throws(() => bufferOf({ Items: [1], Values: [] }), /unexpected buffer/);
  assert.throws(() => bufferOf(undefined), /unexpected buffer/);
});

test('a register missing from the buffer, or with a broken formula, has no value', () => {
  const registers = {
    a_get: { reg_key: 'a_get', offset: 1, mask: 255, formula: '#' },
    b_get: { reg_key: 'b_get', offset: 2, mask: 255, formula: 'eval(#)' },
  };
  const snapshot = new Snapshot(registers, new Map([[2, 7]]));
  assert.equal(snapshot.value('a_get'), null);
  assert.equal(snapshot.value('b_get'), null);
  assert.equal(snapshot.raw('b_get'), 7);
  assert.equal(snapshot.value('nothing_get'), null);
});

test('masks select the bits of a shared word', () => {
  // Nobis: temp_air_enable is bit 3 of word 105 ("#/8").
  const snapshot = snapshotOf('nobis_hybrid', { 105: 0b1000 });
  assert.equal(snapshot.value('temp_air_enable'), 1);
  assert.equal(snapshotOf('nobis_hybrid', { 105: 0b0111 }).value('temp_air_enable'), 0);
});

test('enabled: enable_val, or 1 without it, or always without an enable register', () => {
  // Nordic Fire: word 32828 = 3 -> only the puffer circuit is enabled (enable_val 3).
  const nordic = snapshotOf('nordic_fire_boiler');
  assert.equal(nordic.enabled('temp_water_get'), false);
  assert.equal(nordic.enabled('temp_water_boiler_set'), false);
  assert.equal(nordic.enabled('temp_water_puffer_set'), true);
  assert.equal(nordic.enabled('status_get'), true, 'no status_enable register');
  // Nobis: "#/8" enable without enable_val means 1.
  assert.equal(snapshotOf('nobis_hybrid', { 105: 8 }).enabled('temp_air_get'), true);
  assert.equal(snapshotOf('nobis_hybrid', { 105: 0 }).enabled('temp_air_get'), false);
});

test('options and descriptions, French with an English fallback', () => {
  const snapshot = snapshotOf('piazzetta_pellet_level', { 33: 4 });
  assert.equal(snapshot.describe('status_get', 'ENG'), 'WORKING');
  assert.ok(snapshot.describe('status_get', 'FRE'));
  assert.equal(snapshot.options('status_get', 'XXX').get(4), 'WORKING', 'unknown language');
  assert.equal(snapshot.describe('temp_air_get', 'ENG'), undefined, 'no enc_val');
  assert.equal(snapshot.options('nothing_get').size, 0);
});

test('min, max and step of a register', () => {
  const snapshot = snapshotOf('bronpi');
  assert.equal(snapshot.min('temp_air_set'), 7);
  assert.equal(snapshot.max('temp_air_set'), 40);
  assert.equal(snapshot.step('temp_air_set'), 1);
  assert.equal(snapshot.min('nothing_set'), null);
  assert.equal(snapshot.step('nothing_set'), 1);
});

test('encodeWrite: bounds, inverse formula, integer, hex quirk', () => {
  const bronpi = registersByKey(loadStove('bronpi'));
  // Bronpi setpoint is stored doubled ("#/2" / "#*2").
  assert.deepEqual(encodeWrite(bronpi.temp_air_set, 21.5), {
    offset: 32893,
    mask: 65535,
    value: 43,
  });
  assert.throws(() => encodeWrite(bronpi.temp_air_set, 41), RangeError);
  assert.throws(() => encodeWrite(bronpi.temp_air_set, 6), RangeError);
  assert.throws(() => encodeWrite(bronpi.temp_air_set, 'warm'), /invalid value/);
  assert.throws(() => encodeWrite(undefined, 20), /invalid value/);
  const offset = { offset: 2, mask: 255, set_min: 0, set_max: 300, formula_inverse: '#-30' };
  assert.equal(encodeWrite(offset, 112).value, 82);
  const truncated = { offset: 3, mask: 255, set_min: 0, set_max: 10, formula_inverse: '#*2' };
  assert.equal(encodeWrite(truncated, 2.3).value, 4);
  const hex = { offset: 4, mask: 255, set_min: 0, set_max: 59, formula_inverse: '#', is_hex: true };
  assert.equal(encodeWrite(hex, 25).value, 0x25);
});
