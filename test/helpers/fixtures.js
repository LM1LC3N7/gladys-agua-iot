// -----------------------------------------------------------------------------
// The stove fixtures: register maps of real stoves (see test/fixtures/README.md)
// with the buffer the cloud answers and the values the Python library computes.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { Snapshot, bufferOf } from '../../src/registers.js';

const dir = new URL('../fixtures/stoves/', import.meta.url);

export const STOVE_NAMES = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

/** A fresh copy of a fixture: { stove, registers, buffer, expected }. */
export function loadStove(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
}

/** The registers keyed like registersOf returns them. */
export function registersByKey(fixture) {
  return Object.fromEntries(fixture.registers.map((r) => [r.reg_key.toLowerCase(), r]));
}

/** The Snapshot of a fixture, optionally with some words changed. */
export function snapshotOf(name, words = {}) {
  const fixture = loadStove(name);
  const buffer = bufferOf(fixture.buffer);
  for (const [offset, value] of Object.entries(words)) {
    buffer.set(Number(offset), value);
  }
  return new Snapshot(registersByKey(fixture), buffer);
}
