// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys, and a fake Agua IOT cloud built on the stove fixtures. Timers and
// the clock are mocked: the refresh interval runs when the test ticks.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AguaIotClient } from '../src/api.js';
import { AguaIotApp } from '../src/app.js';
import { ACTIONS, SCENE_TRIGGERS, TIMINGS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { ACCOUNT, fakeCloud } from './helpers/fakeCloud.js';

const CONFIG = { app: 'mypiazzetta', email: ACCOUNT.email, password: ACCOUNT.password };
const PZ = 'PZ0A1B2C3D4E';
const DEVICE = 'ext:test-integration:stove:pz0a1b2c3d4e';
const feature = (key) => `${DEVICE}:${key}`;
const MINUTE = 60_000;

async function setup(
  t,
  { config = CONFIG, stoves = ['piazzetta_pellet_level'], words = {}, prepare } = {},
) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_760_000_000_000 });
  const cloud = fakeCloud({ stoves });
  for (const [offset, value] of Object.entries(words)) {
    cloud.setWord(PZ, Number(offset), value);
  }
  prepare?.(cloud);
  const gladys = createFakeGladys({ config });
  // The cloud jobs answer at once, until a test slows them down.
  let sleep = async () => {};
  const app = new AguaIotApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    createClient: (options) =>
      new AguaIotClient({ ...options, fetch: cloud.fetch, sleep: (ms) => sleep(ms) }),
    loadAppId: async () => '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  t.after(() => app.stop());
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise(setImmediate);
    }
  };
  /** Lets the timers run, then waits for the refresh they started. */
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 5; i += 1) {
      await app.running;
      await flush();
    }
  };
  const slowDown = () => {
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  };
  const create = async () => {
    const device = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE);
    await gladys.fake.deviceCreated(device);
    return device;
  };
  return { gladys, app, cloud, tick, create, flush, slowDown };
}

const count = (cloud, path) => cloud.paths().filter((p) => p === path).length;
/** MyPiazzetta logs in through its bridge: the login is the request carrying the password. */
const logins = (cloud) => cloud.state.requests.filter((r) => r.body?.password).length;
const featureOf = (device, key) => device.features.find((f) => f.external_id === feature(key));

test('the stoves of the account are offered in Discovery', async (t) => {
  const { gladys, cloud } = await setup(t, { stoves: ['piazzetta_pellet_level', 'bronpi'] });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Poêle séjour', 'Bronpi'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /Connected to MyPiazzetta: 2 stoves/);
  assert.match(gladys.fake.connectionStatus.message.fr, /2 poêles/);
  assert.equal(gladys.fake.states.length, 0, 'no state before the user adds a stove');
  assert.equal(cloud.state.requests[1].host, 'piazzetta-iot.app2cloud.it');
});

test('a created stove gets its states, refreshed at the interval', async (t) => {
  const { gladys, cloud, tick, create } = await setup(t);
  await create();
  assert.equal(gladys.fake.lastState(feature('mode')), 0);
  assert.equal(gladys.fake.lastState(feature('status')), 'Éteint');
  assert.equal(gladys.fake.lastState(feature('room')), 20.5);
  assert.equal(gladys.fake.lastState(feature('setpoint')), 25);
  assert.equal(gladys.fake.lastState(feature('power')), '5');
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: DEVICE,
    transport: DEVICE_TRANSPORTS.CLOUD,
  });

  cloud.setWord(PZ, 33, 4);
  cloud.setWord(PZ, 1, 42);
  const reads = count(cloud, '/deviceGetBufferReading');
  await tick(MINUTE - 1);
  assert.equal(count(cloud, '/deviceGetBufferReading'), reads, 'not before the interval');
  await tick(1);
  assert.equal(count(cloud, '/deviceGetBufferReading'), reads + 1);
  assert.equal(gladys.fake.lastState(feature('mode')), 1);
  assert.equal(gladys.fake.lastState(feature('operating')), 1);
  assert.equal(gladys.fake.lastState(feature('status')), 'Chauffe (TRAVAIL)');
  assert.equal(gladys.fake.lastState(feature('room')), 21);

  const sent = gladys.fake.states.length;
  await tick(MINUTE);
  assert.equal(gladys.fake.states.length, sent, 'unchanged values are not sent again');
});

test('the refresh interval comes from the configuration, one minute at least', async (t) => {
  const { cloud, tick } = await setup(t, { config: { ...CONFIG, refresh_interval: 300 } });
  const reads = count(cloud, '/deviceGetBufferReading');
  await tick(4 * MINUTE);
  assert.equal(count(cloud, '/deviceGetBufferReading'), reads);
  await tick(MINUTE);
  assert.equal(count(cloud, '/deviceGetBufferReading'), reads + 1);
});

test('on/off, setpoint and power are written to the stove registers', async (t) => {
  const { gladys, cloud, create, tick } = await setup(t);
  const device = await create();

  let ack = await gladys.fake.setValue(device, featureOf(device, 'mode'), 1);
  assert.equal(ack.success, true);
  assert.deepEqual(
    [cloud.state.writes.at(-1).Items, cloud.state.writes.at(-1).Values],
    [[232], [85]],
  );
  assert.equal(gladys.fake.lastState(feature('mode')), 1);

  ack = await gladys.fake.setValue(device, featureOf(device, 'setpoint'), 21.4);
  assert.equal(ack.success, true);
  assert.deepEqual(
    [cloud.state.writes.at(-1).Items, cloud.state.writes.at(-1).Values],
    [[32893], [21]],
  );
  assert.equal(gladys.fake.lastState(feature('setpoint')), 21);

  ack = await gladys.fake.setValue(device, featureOf(device, 'power'), '3');
  assert.equal(ack.success, true);
  assert.deepEqual(
    [cloud.state.writes.at(-1).Items, cloud.state.writes.at(-1).Values],
    [[32895], [3]],
  );
  assert.equal(gladys.fake.lastState(feature('power')), '3');

  ack = await gladys.fake.setValue(device, featureOf(device, 'mode'), 0);
  assert.equal(ack.success, true);
  assert.equal(cloud.state.writes.at(-1).Values[0], 170);

  // The stove is read again shortly after a command.
  const reads = count(cloud, '/deviceGetBufferReading');
  await tick(TIMINGS.refreshAfterCommand);
  assert.equal(count(cloud, '/deviceGetBufferReading'), reads + 1);
  assert.equal(gladys.fake.lastState(feature('setpoint')), 21);
});

test('setpoints are bounded and stepped, and stored with the inverse formula', async (t) => {
  const { gladys, cloud } = await setup(t, { stoves: ['bronpi'] });
  const device = gladys.fake.discoveredDevices[0];
  await gladys.fake.deviceCreated(device);
  const setpoint = device.features.find((f) => f.external_id.endsWith(':setpoint'));
  // Bronpi stores the setpoint doubled ("#*2").
  await gladys.fake.setValue(device, setpoint, 21);
  assert.deepEqual(cloud.state.writes.at(-1).Values, [42]);
  await gladys.fake.setValue(device, setpoint, 55);
  assert.deepEqual(cloud.state.writes.at(-1).Values, [80], 'clamped to 40 °C');
  const refused = await gladys.fake.setValue(device, setpoint, 'warm');
  assert.equal(refused.success, false);
});

test('the water setpoint of a boiler', async (t) => {
  const { gladys, cloud } = await setup(t, { stoves: ['nordic_fire_boiler'] });
  const device = gladys.fake.discoveredDevices[0];
  await gladys.fake.deviceCreated(device);
  const water = device.features.find((f) => f.external_id.endsWith(':water-setpoint'));
  const ack = await gladys.fake.setValue(device, water, 70);
  assert.equal(ack.success, true);
  assert.deepEqual(
    [cloud.state.writes.at(-1).Items, cloud.state.writes.at(-1).Values],
    [[32899], [70]],
  );
  assert.equal(
    gladys.fake.lastState(
      device.features.find((f) => f.external_id.endsWith(':water')).external_id,
    ),
    19.5,
  );
});

test('commands that cannot be done are refused with a reason', async (t) => {
  const { gladys, cloud, create } = await setup(t);
  const device = await create();
  const room = await gladys.fake.setValue(device, featureOf(device, 'room'), 20);
  assert.equal(room.success, false);
  assert.match(room.error, /cannot be controlled/);
  const power = await gladys.fake.setValue(device, featureOf(device, 'power'), '9');
  assert.equal(power.success, false);
  assert.match(power.error, /unknown power level/);
  cloud.state.jobResult.write = 'error';
  const failed = await gladys.fake.setValue(device, featureOf(device, 'mode'), 1);
  assert.equal(failed.success, false);
  assert.match(failed.error, /did not confirm/);
  assert.equal(gladys.fake.lastState(feature('mode')), 0, 'no state for a refused command');
});

test('a slow stove: Gladys gets its answer in time, the command is confirmed later', async (t) => {
  const { gladys, cloud, create, flush, slowDown } = await setup(t);
  const device = await create();
  // The write job is still "waiting" after the command budget of Gladys.
  cloud.state.jobWaits = 6;
  slowDown();
  let ack;
  gladys.fake.setValue(device, featureOf(device, 'mode'), 1).then((a) => {
    ack = a;
  });
  for (let elapsed = 0; elapsed < TIMINGS.commandAck; elapsed += 1000) {
    await flush();
    assert.equal(ack, undefined, `answered after ${elapsed} ms`);
    t.mock.timers.tick(1000);
  }
  await flush();
  assert.equal(ack?.success, true);
  assert.equal(gladys.fake.lastState(feature('mode')), 1);
  for (let i = 0; i < 4; i += 1) {
    t.mock.timers.tick(1000);
    await flush();
  }
  const job = [...cloud.state.jobs.values()].at(-1);
  assert.equal(job.waits, 0, 'the job was followed until the stove answered');
});

test('a stove alarm fires the "stove alarm" scene trigger once', async (t) => {
  const { gladys, cloud, tick, create } = await setup(t);
  await create();
  cloud.setWord(PZ, 33, 8);
  cloud.setWord(PZ, 51, 2);
  await tick(MINUTE);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.STOVE_ALARM,
      data: {
        stove: DEVICE,
        stove_name: 'Poêle séjour',
        alarm_code: 2,
        alarm_label: 'E4',
        status: 'Alarme : E4',
        summary: 'Poêle séjour : alarme du poêle (E4)',
      },
    },
  ]);
  assert.equal(gladys.fake.lastState(feature('alarm')), 1);
  assert.equal(gladys.fake.lastState(feature('mode')), 0);
  await tick(MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 1, 'once per alarm');
  cloud.setWord(PZ, 51, 4);
  await tick(MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 2, 'another alarm code is another alarm');
  cloud.setWord(PZ, 33, 0);
  cloud.setWord(PZ, 51, 0);
  await tick(MINUTE);
  assert.equal(gladys.fake.lastState(feature('alarm')), 0);
  cloud.setWord(PZ, 33, 9);
  await tick(MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 3);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.alarm_code, 0);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.status, "Alarme (MEMOIRE D'ALARME)");
});

test('an alarm already there at startup is the baseline, not an event', async (t) => {
  const { gladys, tick } = await setup(t, { words: { 33: 8, 51: 2 } });
  await tick(MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('missing configuration: a status, and no call to the cloud', async (t) => {
  const { gladys, cloud } = await setup(t, { config: { app: 'mypiazzetta', email: '' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Choose the app/);
  assert.equal(cloud.state.requests.length, 0);
  const answer = await gladys.fake.action(ACTIONS.TEST, {});
  assert.match(answer.data.message.en, /Choose the app/);
});

test('refused credentials: a clear status, and no new attempt for 15 minutes', async (t) => {
  const { gladys, cloud, tick } = await setup(t, { config: { ...CONFIG, password: 'nope' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /MyPiazzetta refused the e-mail/);
  const before = logins(cloud);
  await tick(10 * MINUTE);
  assert.equal(logins(cloud), before);
  await tick(5 * MINUTE);
  assert.equal(logins(cloud), before + 1);
  // Saving the configuration tries again at once, even unchanged.
  await gladys.fake.configUpdated({ ...CONFIG, password: 'nope' });
  assert.equal(logins(cloud), before + 2);
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a stove without any known register is not offered', async (t) => {
  const { gladys } = await setup(t, {
    stoves: ['piazzetta_pellet_level', 'bronpi'],
    prepare: (cloud) => {
      cloud.state.stoves.get('BP8899AABBCC').fixture.registers = [];
    },
  });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Poêle séjour'],
  );
});

test('a garbled reading only makes that stove unreachable', async (t) => {
  const { gladys, cloud, tick, create } = await setup(t);
  await create();
  cloud.state.jobResult.read = 'garbled';
  await tick(MINUTE);
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a stove that cannot be read is unreachable until the next good reading', async (t) => {
  const { gladys, cloud, tick } = await setup(t);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  // The buffer of a stove cannot be read: the stove is unreachable, the account still connected.
  cloud.state.failures.set('/deviceGetBufferReading', 502);
  await tick(MINUTE);
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  cloud.state.failures.delete('/deviceGetBufferReading');
  await tick(MINUTE);
  assert.equal(gladys.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.CLOUD);
});

test('the cloud down at startup: unreachable status, connected once it answers', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_760_000_000_000 });
  const cloud = fakeCloud();
  cloud.state.failures.set('/appSignup', 'network');
  const gladys = createFakeGladys({ config: CONFIG });
  const app = new AguaIotApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    createClient: (options) =>
      new AguaIotClient({ ...options, fetch: cloud.fetch, sleep: async () => {} }),
    loadAppId: async () => '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /unreachable \(piazzetta.agua-iot.com: ECONNREFUSED\)/,
  );
  cloud.state.failures.clear();
  t.mock.timers.tick(MINUTE);
  await app.running;
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('"Test the connection" logs in and lists the stoves', async (t) => {
  const { gladys } = await setup(t);
  const ok = await gladys.fake.action(ACTIONS.TEST, {});
  assert.equal(ok.success, true);
  assert.equal(ok.data.message.en, 'Login OK on MyPiazzetta: 1 stove ("Poêle séjour").');
  assert.equal(ok.data.message.fr, 'Connexion OK sur MyPiazzetta : 1 poêle ("Poêle séjour").');
  await gladys.fake.configUpdated({ ...CONFIG, password: 'nope' });
  const refused = await gladys.fake.action(ACTIONS.TEST, {});
  assert.match(refused.data.message.en, /refused the e-mail or the password/);
});

test('a scan lists the stoves of the account again', async (t) => {
  const { gladys, cloud } = await setup(t);
  const lists = count(cloud, '/deviceList');
  await gladys.fake.scanRequest();
  assert.equal(count(cloud, '/deviceList'), lists + 1);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('Gladys reconnecting gets the states again, without a new login', async (t) => {
  const { gladys, cloud, create } = await setup(t);
  await create();
  const before = logins(cloud);
  const sent = gladys.fake.states.length;
  await gladys.disconnect();
  await gladys.connect();
  assert.equal(logins(cloud), before);
  assert.ok(gladys.fake.states.length > sent, 'the states are sent again');
});

test('a new configuration logs in to the new app', async (t) => {
  const { gladys, cloud } = await setup(t);
  await gladys.fake.configUpdated({ ...CONFIG, app: 'total_control_3' });
  assert.equal(cloud.state.requests.at(-1).host, 'extraflame.agua-iot.com');
  assert.match(gladys.fake.connectionStatus.message.en, /Total Control 3.0/);
});

test('a deleted stove gets no more transport badge', async (t) => {
  const { gladys, cloud, tick, create } = await setup(t);
  const device = await create();
  await gladys.fake.deviceDeleted(device);
  const badges = gladys.fake.transports.length;
  cloud.state.failures.set('/deviceGetBufferReading', 502);
  await tick(MINUTE);
  assert.equal(gladys.fake.transports.length, badges);
});
