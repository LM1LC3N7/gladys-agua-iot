import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { FEATURES } from '../src/constants.js';
import { buildDevice, buildStates, statusText, stoveId } from '../src/devices.js';
import { layoutOf, readStove } from '../src/stove.js';
import { STOVE_NAMES, loadStove, snapshotOf } from './helpers/fixtures.js';

function entryOf(name, words) {
  const fixture = loadStove(name);
  const stove = {
    idDevice: fixture.stove.id_device,
    name: fixture.stove.name,
    product: fixture.stove.name_product,
    online: true,
  };
  const snapshot = snapshotOf(name, words);
  return { stove, snapshot, layout: layoutOf(snapshotOf(name)) };
}

const keysOf = (device) => device.features.map((f) => f.external_id.split(':').at(-1));

test('stoveId: the Agua IOT device id, safe in an external id', () => {
  assert.equal(stoveId({ idDevice: 'PZ0A1B2C3D4E' }), 'pz0a1b2c3d4e');
  assert.equal(stoveId({ idDevice: ' AB:CD/12 ' }), 'ab-cd-12');
  assert.equal(stoveId({ id: 42 }), '42');
  assert.equal(stoveId({}), 'unknown');
});

test('the device of every fixture is accepted by Gladys, and so are its states', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  for (const name of STOVE_NAMES) {
    const entry = entryOf(name);
    const device = buildDevice(gladys, entry, 'fr', 'FRE');
    await gladys.publishDiscoveredDevices([device]);
    assert.equal(device.external_id, `ext:test-integration:stove:${stoveId(entry.stove)}`);
    assert.equal(device.should_poll, false);
    const reading = readStove(entry.snapshot, entry.layout, 'FRE');
    const states = buildStates(gladys, entry, reading, 'fr');
    const ids = new Set(device.features.map((f) => f.external_id));
    for (const state of states) {
      assert.ok(ids.has(state.device_feature_external_id), `${name}: a state without feature`);
    }
    await gladys.publishStates(states);
  }
});

test('a pellet stove: thermostat, temperatures, state, alarm, power', async () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, entryOf('piazzetta_pellet_level'), 'fr', 'FRE');
  assert.equal(device.name, 'Poêle séjour');
  assert.deepEqual(device.params, [{ name: 'PRODUCT', value: 'Piazzetta P963' }]);
  assert.deepEqual(keysOf(device), [
    FEATURES.MODE,
    FEATURES.SETPOINT,
    FEATURES.OPERATING,
    FEATURES.ROOM,
    FEATURES.SMOKE,
    FEATURES.STATUS,
    FEATURES.ALARM,
    FEATURES.POWER,
  ]);
  const byKey = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f]),
  );
  assert.equal(byKey.mode.category, 'thermostat');
  assert.equal(byKey.mode.type, 'mode');
  assert.equal(byKey.mode.read_only, false);
  assert.deepEqual(byKey.mode.supported_options, [
    { value: 0, label: 'Arrêt' },
    { value: 1, label: 'Marche' },
  ]);
  assert.equal(byKey.mode.name, 'Marche/arrêt');
  assert.deepEqual(
    [byKey.setpoint.type, byKey.setpoint.unit, byKey.setpoint.min, byKey.setpoint.max],
    ['target-temperature', 'celsius', 7, 30],
  );
  assert.equal(byKey.setpoint.step, 1);
  assert.equal(byKey.operating.type, 'operating-state');
  assert.equal(byKey.room.type, 'decimal');
  assert.equal(byKey.smoke.type, 'probe');
  assert.equal(byKey.status.category, 'text');
  assert.equal(byKey.alarm.read_only, true);
  assert.equal(byKey.power.type, 'select');
  assert.deepEqual(
    byKey.power.supported_options.map((o) => o.value),
    ['1', '2', '3', '4', '5'],
  );
});

test('a boiler: the water setpoint and temperature, no room thermostat', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, entryOf('nordic_fire_boiler'), 'en', 'ENG');
  assert.deepEqual(keysOf(device), [
    FEATURES.MODE,
    FEATURES.WATER_SETPOINT,
    FEATURES.OPERATING,
    FEATURES.WATER,
    FEATURES.STATUS,
    FEATURES.ALARM,
    FEATURES.POWER,
  ]);
  const water = device.features.find((f) => f.external_id.endsWith(':water-setpoint'));
  assert.deepEqual([water.name, water.min, water.max], ['Water setpoint', 40, 75]);
});

test('states of a heating stove', () => {
  const gladys = createFakeGladys();
  const entry = entryOf('piazzetta_pellet_level', { 33: 4 });
  const reading = readStove(entry.snapshot, entry.layout, 'FRE');
  const states = Object.fromEntries(
    buildStates(gladys, entry, reading, 'fr').map(({ device_feature_external_id: id, ...v }) => [
      id.split(':').at(-1),
      v,
    ]),
  );
  assert.deepEqual(states, {
    mode: { state: 1 },
    operating: { state: 1 },
    alarm: { state: 0 },
    status: { text: 'Chauffe (TRAVAIL)' },
    setpoint: { state: 25 },
    room: { state: 20.5 },
    smoke: { state: 30 },
    power: { text: '5' },
  });
});

test('the status text: phase, stove text, alarm', () => {
  const base = { status: 4, statusText: undefined, alarm: false, alarmText: null };
  assert.equal(statusText({ ...base, phase: 'heating' }, 'en'), 'Heating');
  assert.equal(
    statusText({ ...base, phase: 'heating', statusText: 'Work' }, 'en'),
    'Heating (Work)',
  );
  assert.equal(statusText({ ...base, phase: 'heating', statusText: 'HEATING' }, 'en'), 'Heating');
  assert.equal(statusText({ ...base, phase: 'unknown', statusText: 'TURBO' }, 'fr'), 'TURBO');
  assert.equal(statusText({ ...base, phase: 'unknown', status: 42 }, 'fr'), 'État 42');
  assert.equal(
    statusText({ ...base, phase: 'alarm', alarm: true, alarmText: 'Ignition failed' }, 'en'),
    'Alarm: Ignition failed',
  );
  assert.equal(
    statusText({ ...base, phase: 'alarm', alarm: true, statusText: 'MEMORY ALARM' }, 'en'),
    'Alarm (MEMORY ALARM)',
  );
});

test('a stove that cannot be commanded gets a read-only mode', () => {
  const gladys = createFakeGladys();
  const entry = entryOf('bronpi');
  entry.layout = { ...entry.layout, command: false, power: false };
  const device = buildDevice(gladys, entry, 'en', 'ENG');
  const mode = device.features.find((f) => f.external_id.endsWith(':mode'));
  assert.equal(mode.read_only, true);
  assert.ok(!keysOf(device).includes(FEATURES.POWER));
});
