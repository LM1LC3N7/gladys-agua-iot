import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { ENDPOINTS } from '../src/endpoints.js';
import { loadAppId } from '../src/storage.js';

test('normalizeConfig without anything: everything to fill in', () => {
  const config = normalizeConfig();
  assert.deepEqual(config.missing, ['app', 'email', 'password']);
  assert.equal(config.endpoint, undefined);
  assert.equal(config.language, 'fr');
  assert.equal(config.cloudLanguage, 'FRE');
  assert.equal(config.refreshInterval, 60);
});

test('normalizeConfig: the endpoint of the app, trimmed e-mail, untouched password', () => {
  const config = normalizeConfig({
    app: 'jolly_mec',
    email: ' me@example.com ',
    password: ' p@ss ',
    language: 'en',
    refresh_interval: '120',
  });
  assert.deepEqual(config.missing, []);
  assert.equal(config.endpoint, ENDPOINTS.jolly_mec);
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' p@ss ');
  assert.equal(config.cloudLanguage, 'ENG');
  assert.equal(config.refreshInterval, 120);
});

test('normalizeConfig: an unknown app, a language or an interval out of range', () => {
  assert.deepEqual(normalizeConfig({ app: 'toString', email: 'a', password: 'b' }).missing, [
    'app',
  ]);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
  assert.equal(normalizeConfig({ refresh_interval: 5 }).refreshInterval, 60);
  assert.equal(normalizeConfig({ refresh_interval: 99999 }).refreshInterval, 3600);
  assert.equal(normalizeConfig({ refresh_interval: 'soon' }).refreshInterval, 60);
  assert.equal(normalizeConfig({ refresh_interval: null }).refreshInterval, 60);
});

test('the app id is generated once and kept in /data', async () => {
  const files = new Map();
  const fs = {
    readFile: async (path) => {
      if (!files.has(path)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return files.get(path);
    },
    writeFile: async (path, text) => {
      files.set(path, text);
    },
  };
  let n = 0;
  const randomUUID = () => `00000000-0000-4000-8000-00000000000${(n += 1)}`;
  const first = await loadAppId({ dir: '/data', fs, randomUUID });
  assert.equal(first, '00000000-0000-4000-8000-000000000001');
  assert.equal(await loadAppId({ dir: '/data', fs, randomUUID }), first);
  files.set('/data/agua-iot.json', '{"app_id":"garbage"}');
  assert.equal(
    await loadAppId({ dir: '/data', fs, randomUUID }),
    '00000000-0000-4000-8000-000000000002',
  );
});

test('a read-only /data still gives an app id, for this run', async () => {
  const warnings = [];
  const fs = {
    readFile: async () => {
      throw new Error('missing');
    },
    writeFile: async () => {
      throw Object.assign(new Error('read-only'), { code: 'EROFS' });
    },
  };
  const id = await loadAppId({ fs, logger: { warn: (line) => warnings.push(line) } });
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.match(warnings[0], /EROFS/);
});
