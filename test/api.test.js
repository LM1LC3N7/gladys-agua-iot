import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AguaIotClient,
  AguaIotConnectionError,
  AguaIotError,
  AguaIotUnauthorized,
  tokenExpiry,
} from '../src/api.js';
import { ENDPOINTS } from '../src/endpoints.js';
import { ACCOUNT, fakeCloud, jwt } from './helpers/fakeCloud.js';

const APP_ID = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

function setup({ app = 'total_control_3', stoves, now, password = ACCOUNT.password } = {}) {
  const cloud = fakeCloud({ stoves, now });
  const lines = [];
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [level, (line) => lines.push(line)]),
  );
  const client = new AguaIotClient({
    endpoint: ENDPOINTS[app],
    email: ACCOUNT.email,
    password,
    appId: APP_ID,
    fetch: cloud.fetch,
    now,
    sleep: async () => {},
    logger,
  });
  return { cloud, client, lines };
}

test('tokenExpiry reads the exp claim, without trusting anything else', () => {
  assert.equal(tokenExpiry(jwt({ exp: 1_800_000_000 })), 1_800_000_000);
  assert.equal(tokenExpiry('not-a-jwt'), null);
  assert.equal(tokenExpiry(jwt({ sub: 'x' })), null);
});

test('connect: the app registration, then the login, with the headers of the vendor app', async () => {
  const { cloud, client } = setup();
  await client.connect();
  const [signup, login] = cloud.state.requests;
  assert.equal(signup.host, 'extraflame.agua-iot.com');
  assert.equal(signup.path, '/appSignup');
  assert.equal(signup.headers.customer_code, '195764');
  assert.equal(signup.headers.id_brand, '1');
  assert.equal(signup.headers.Origin, 'file://');
  assert.equal(signup.headers.brand, undefined);
  assert.equal(signup.body.id_app, APP_ID);
  assert.equal(login.path, '/userLogin');
  assert.equal(login.headers.local, 'true');
  assert.equal(login.headers.Authorization, APP_ID);
  assert.deepEqual(login.body, { email: ACCOUNT.email, password: ACCOUNT.password });
  assert.ok(client.token);
});

test('MyPiazzetta and MySuperior log in through their bridge, with their brand', async () => {
  const { cloud, client } = setup({ app: 'mysuperior' });
  await client.connect();
  const login = cloud.state.requests[1];
  assert.equal(login.host, 'piazzetta-iot.app2cloud.it');
  assert.equal(login.path, '/api/bridge/endpoint/');
  assert.equal(login.headers.applicationversion, '1.9.7');
  assert.equal(login.headers.url, 'userLogin');
  assert.equal(login.headers.id_brand, '2');
  assert.equal(login.headers.brand, 'superior');
  assert.equal(cloud.state.requests[0].host, 'piazzetta.agua-iot.com');
});

test('refused credentials or registration are AguaIotUnauthorized', async () => {
  const wrong = setup({ password: 'wrong' });
  await assert.rejects(wrong.client.connect(), AguaIotUnauthorized);
  const refused = setup();
  refused.cloud.state.failures.set('/appSignup', 400);
  await assert.rejects(refused.client.connect(), AguaIotUnauthorized);
});

test('a network failure is an AguaIotConnectionError naming the host only', async () => {
  const { cloud, client } = setup();
  cloud.state.failures.set('/appSignup', 'network');
  await assert.rejects(client.connect(), (err) => {
    assert.ok(err instanceof AguaIotConnectionError);
    assert.equal(err.message, 'extraflame.agua-iot.com: ECONNREFUSED');
    return true;
  });
});

test('listStoves: the device list, with the register map of each stove', async () => {
  const { client } = setup({ stoves: ['bronpi', 'evacalor'] });
  await client.connect();
  const stoves = await client.listStoves();
  assert.deepEqual(
    stoves.map((s) => [s.idDevice, s.name, s.product, s.idRegistersMap, s.online]),
    [
      ['BP8899AABBCC', 'Bronpi', 'Bronpi Petra', 3, true],
      ['EV0011223344', 'Eva', 'EvaCalòr Monica', 1, true],
    ],
  );
  const map = await client.registersMap(stoves[0]);
  assert.equal(map.device_registers_map.registers_map.length, 2);
});

test('an expired token is refreshed before the call; a refused refresh logs in again', async () => {
  let clock = 1_760_000_000_000;
  const { cloud, client } = setup({ now: () => clock });
  await client.connect();
  clock += 3600 * 1000;
  await client.listStoves();
  assert.ok(cloud.paths().includes('/refreshToken'));
  cloud.state.refreshTokens.clear();
  clock += 3600 * 1000;
  const logins = cloud.paths().filter((p) => p === '/userLogin').length;
  await client.listStoves();
  assert.equal(cloud.paths().filter((p) => p === '/userLogin').length, logins + 1);
});

test('a 401 refreshes the token and retries once', async () => {
  const { cloud, client } = setup();
  await client.connect();
  cloud.state.tokens.clear();
  const stoves = await client.listStoves();
  assert.equal(stoves.length, 1);
  assert.deepEqual(cloud.paths().slice(-4, -2), ['/deviceList', '/refreshToken']);
});

test('a call that keeps failing is an error with its status', async () => {
  const { cloud, client } = setup();
  await client.connect();
  cloud.state.failures.set('/deviceList', 500);
  await assert.rejects(client.listStoves(), (err) => {
    assert.ok(err instanceof AguaIotError);
    assert.match(err.message, /HTTP 500/);
    return true;
  });
});

test('readBuffer waits for the job of the stove', async () => {
  const { cloud, client } = setup({ stoves: ['bronpi'] });
  cloud.state.jobWaits = 3;
  await client.connect();
  const [stove] = await client.listStoves();
  const data = await client.readBuffer(stove);
  assert.equal(data.Items.length, data.Values.length);
  assert.equal(cloud.paths().filter((p) => p.startsWith('/deviceJobStatus/')).length, 4);
  cloud.state.jobResult.read = 'error';
  await assert.rejects(client.readBuffer(stove), /buffer reading error/);
});

test('readBuffer gives up when the stove does not answer in time', async () => {
  let clock = 1_760_000_000_000;
  const { cloud, client } = setup({ now: () => clock });
  await client.connect();
  const [stove] = await client.listStoves();
  cloud.state.jobWaits = 100;
  client.sleep = async (ms) => {
    clock += ms;
  };
  await assert.rejects(client.readBuffer(stove), AguaIotConnectionError);
  assert.ok(clock - 1_760_000_000_000 <= 30_000, 'within the 30 s of the library');
});

test('requestWrite and confirmWrite: the RWMSmaster job of the library', async () => {
  const { cloud, client } = setup({ stoves: ['bronpi'] });
  await client.connect();
  const [stove] = await client.listStoves();
  const id = await client.requestWrite(stove, [{ offset: 32893, mask: 65535, value: 43 }]);
  await client.confirmWrite(id);
  const [write] = cloud.state.writes;
  assert.deepEqual(
    [write.Protocol, write.Items, write.Masks, write.Values, write.BitData, write.Endianess],
    ['RWMSmaster', [32893], [65535], [43], [8], ['L']],
  );
  assert.equal(cloud.word('BP8899AABBCC', 32893), 43);
  cloud.state.jobResult.write = 'error';
  const failing = await client.requestWrite(stove, [{ offset: 32893, mask: 65535, value: 40 }]);
  await assert.rejects(client.confirmWrite(failing), /did not confirm/);
});

test('the password, the tokens and the headers never reach the logs', async () => {
  const { cloud, client, lines } = setup({ stoves: ['bronpi'] });
  await client.connect();
  cloud.state.tokens.clear();
  const [stove] = await client.listStoves();
  await client.readBuffer(stove);
  cloud.state.refreshTokens.clear();
  cloud.state.tokens.clear();
  await client.listStoves();
  const logged = lines.join('\n');
  assert.ok(lines.length > 5);
  for (const secret of [ACCOUNT.password, client.token, 'refresh-', APP_ID, ACCOUNT.email]) {
    assert.ok(!logged.includes(secret), `${secret} was logged`);
  }
});
