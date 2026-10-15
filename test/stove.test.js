import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES,
  commandValue,
  layoutOf,
  phaseOf,
  powerOptions,
  readStove,
  setpointRange,
} from '../src/stove.js';
import { Snapshot } from '../src/registers.js';
import { snapshotOf } from './helpers/fixtures.js';

const { OFF, IGNITION, HEATING, CLEANING, STANDBY, SHUTDOWN, ALARM, UNKNOWN } = PHASES;

test('every status text of the 27 register maps of the HA integration finds its phase', () => {
  const cases = {
    [IGNITION]: [
      'START',
      'LOAD PELLET',
      'FLAME LIGHT',
      'Ignition',
      'Awaiting flame',
      'Starting',
      'CHECK UP',
      'WAIT',
      'PELLET LOAD',
      'AWAITING FLAME',
      'LIGHTING',
      'CONTROL',
      'START PHASE I',
      'START PHASE II',
      'IGNITION',
      'WAITING FLAME',
      'PELLET LIGHT PREP.',
      'MAN TEST START',
      'BRACE TEST START',
    ],
    [HEATING]: ['WORK', 'Work', 'On', 'WORKING', 'PELLET WORKING', 'WOOD WORKING'],
    [CLEANING]: [
      'CLEANING FIRE-POT',
      'Brazier cleaning',
      'CLEANING',
      'Cleaning',
      'CLEAN',
      'ASHPAN CLEANING',
      'CLEANING GRATE',
      'FIRE POT CLEANING',
    ],
    [SHUTDOWN]: [
      'CLEANING FINAL',
      'Final cleaning',
      'FINAL CLEANING',
      'FINAL CLEAN',
      'Shut Off',
      'STOP',
    ],
    [STANDBY]: ['STAND-BY', 'Stand-by', 'STANDBY', 'STAND BY', 'ECO STOP', 'WAITING RESTART'],
    [ALARM]: [
      'ALARM',
      'ALARM MEM.',
      'Allarm',
      'M. Allarm',
      'Alarm',
      'Mem. Alarm',
      'MEM.ALM',
      'ALARM MEMORY',
      'MEM-ALARM',
      'MEMORY ALARM',
    ],
    [OFF]: ['OFF', 'Off'],
  };
  for (const [phase, descriptions] of Object.entries(cases)) {
    for (const description of descriptions) {
      assert.equal(phaseOf(3, description), phase, description);
    }
  }
});

test('status 0 is off whatever the map says, and the usual numbers fill the gaps', () => {
  assert.equal(phaseOf(0, 'START'), OFF, 'Alfaplam calls 0 "START"');
  assert.equal(phaseOf(null, 'WORK'), UNKNOWN);
  assert.equal(phaseOf(4, undefined), HEATING);
  assert.equal(phaseOf(6, ''), SHUTDOWN);
  assert.equal(phaseOf(8, undefined), ALARM);
  assert.equal(phaseOf(42, undefined), UNKNOWN);
  assert.equal(phaseOf(5, 'SOMETHING NEW'), UNKNOWN);
});

test('the registers of each stove, like the HA integration picks them', () => {
  const layouts = {
    piazzetta_pellet_level: {
      roomKey: 'temp_air_get',
      setpointKey: 'temp_air_set',
      waterKey: null,
      waterSetpointKey: null,
      smoke: true,
    },
    // Only the puffer circuit is enabled on this boiler.
    nordic_fire_boiler: {
      roomKey: null,
      setpointKey: null,
      waterKey: 'temp_water_puffer_get',
      waterSetpointKey: 'temp_water_puffer_set',
      smoke: false,
    },
    jollymec_wood: { roomKey: 'temp_air_get', setpointKey: 'temp_air_set', smoke: true },
    // No temp_air_get: the second probe is the room temperature.
    nobis_hybrid: { roomKey: 'temp_air2_get', setpointKey: 'temp_air_set', smoke: true },
    bronpi: { roomKey: 'temp_air_get', setpointKey: 'temp_air_set', smoke: true },
    evacalor: {
      roomKey: 'temp_air_get',
      setpointKey: 'temp_air_set',
      waterKey: 'temp_water_get',
      waterSetpointKey: 'temp_water_set',
    },
    ravelli: { roomKey: 'temp_air_get', setpointKey: 'temp_air_set' },
  };
  for (const [name, expected] of Object.entries(layouts)) {
    const layout = layoutOf(snapshotOf(name));
    assert.equal(layout.status, true, name);
    assert.equal(layout.command, true, name);
    assert.equal(layout.power, true, name);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(layout[key], value, `${name}: ${key}`);
    }
  }
});

test('setpoint bounds leave out the special end values', () => {
  assert.deepEqual(setpointRange(snapshotOf('bronpi'), 'temp_air_set'), {
    min: 7,
    max: 40,
    step: 1,
  });
  // Nobis: 41 = "MAN" (manual power). Ravelli: 6 = "- EXT", 41 = "MAN".
  assert.equal(setpointRange(snapshotOf('nobis_hybrid'), 'temp_air_set').max, 40);
  assert.deepEqual(setpointRange(snapshotOf('ravelli'), 'temp_air_set'), {
    min: 7,
    max: 40,
    step: 1,
  });
  assert.deepEqual(setpointRange(snapshotOf('bronpi'), 'nothing_set'), {
    min: 5,
    max: 35,
    step: 1,
  });
});

test('power levels: the range of power_set, labelled by the stove', () => {
  const jolly = powerOptions(snapshotOf('jollymec_wood'), 'ENG');
  assert.deepEqual(
    jolly.map((o) => o.value),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(jolly[0].label, 'SIL');
  assert.deepEqual(powerOptions(snapshotOf('bronpi'), 'FRE'), [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
  ]);
});

test('a stove at rest, then heating', () => {
  const layout = layoutOf(snapshotOf('piazzetta_pellet_level'));
  const off = readStove(snapshotOf('piazzetta_pellet_level'), layout, 'FRE');
  assert.equal(off.phase, OFF);
  assert.equal(off.on, false);
  assert.equal(off.heating, false);
  assert.equal(off.alarm, false);
  assert.equal(off.room, 20.5);
  assert.equal(off.setpoint, 25);
  assert.equal(off.power, 5);
  assert.equal(off.smoke, 30);
  assert.equal(off.water, null);
  const working = readStove(snapshotOf('piazzetta_pellet_level', { 33: 4 }), layout, 'FRE');
  assert.equal(working.phase, HEATING);
  assert.equal(working.on, true);
  assert.equal(working.heating, true);
  assert.equal(working.statusText, 'TRAVAIL');
  const standby = readStove(snapshotOf('piazzetta_pellet_level', { 33: 7 }), layout, 'ENG');
  assert.deepEqual([standby.phase, standby.on, standby.heating], [STANDBY, true, false]);
  const shutdown = readStove(snapshotOf('piazzetta_pellet_level', { 33: 6 }), layout, 'ENG');
  assert.deepEqual([shutdown.phase, shutdown.on, shutdown.heating], [SHUTDOWN, false, false]);
});

test('an alarm, with the code and the text of the stove', () => {
  const layout = layoutOf(snapshotOf('piazzetta_pellet_level'));
  const reading = readStove(snapshotOf('piazzetta_pellet_level', { 33: 8, 51: 2 }), layout, 'ENG');
  assert.equal(reading.phase, ALARM);
  assert.equal(reading.on, false);
  assert.equal(reading.alarm, true);
  assert.equal(reading.alarmCode, 2);
  assert.equal(reading.alarmText, 'E4');
  // Ravelli fills its unused codes with " --": no text then.
  const ravelli = layoutOf(snapshotOf('ravelli'));
  const filler = readStove(snapshotOf('ravelli', { 33: 8, 64: 1 }), ravelli, 'ENG');
  assert.equal(filler.alarmCode, 1);
  assert.equal(filler.alarmText, null);
  // Not in alarm: the alarm register is not read.
  assert.equal(readStove(snapshotOf('ravelli', { 64: 16 }), ravelli, 'ENG').alarmCode, null);
});

test('temperatures that are not temperatures are left out', () => {
  const layout = layoutOf(snapshotOf('jollymec_wood'));
  // 254 / 2 = 127 = "TOFF": the external thermostat contact, not a temperature.
  assert.equal(readStove(snapshotOf('jollymec_wood', { 20: 254 }), layout, 'ENG').room, null);
  // 32768: the Wi-Fi module could not read the board.
  const bronpi = layoutOf(snapshotOf('bronpi'));
  assert.equal(readStove(snapshotOf('bronpi', { 1: 32768 }), bronpi, 'ENG').room, null);
  assert.equal(readStove(snapshotOf('bronpi', { 1: 400 }), bronpi, 'ENG').room, null, '200 °C');
  assert.equal(readStove(snapshotOf('bronpi', { 1: 41 }), bronpi, 'ENG').room, 20.5);
});

test('a stove read for the first time has no state yet', () => {
  const registers = snapshotOf('bronpi').registers;
  const layout = layoutOf(snapshotOf('bronpi'));
  const empty = readStove(new Snapshot(registers), layout, 'ENG');
  assert.equal(empty.phase, UNKNOWN);
  assert.equal(empty.on, null);
  assert.equal(empty.room, null);
  assert.equal(empty.statusText, undefined);
});

test('the on and off values of status_managed_get', () => {
  const snapshot = snapshotOf('piazzetta_pellet_level');
  assert.equal(commandValue(snapshot, true), 85);
  assert.equal(commandValue(snapshot, false), 170);
  const bare = new Snapshot({ status_managed_get: { offset: 232, mask: 255 } });
  assert.equal(commandValue(bare, true), 85);
  assert.equal(commandValue(bare, false), 170);
});
