// -----------------------------------------------------------------------------
// A fake Agua IOT cloud, as a `fetch` function: the routes, status codes and
// answer shapes the Python library relies on, the stoves of the fixtures, JWT
// tokens with an expiry, read and write jobs. Every request is recorded.
// -----------------------------------------------------------------------------

import { bufferOf } from '../../src/registers.js';
import { loadStove } from './fixtures.js';

export const ACCOUNT = { email: 'stove.owner@example.com', password: 'S3cret-pellets!' };

const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
export const jwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;

export function fakeCloud({ stoves = ['piazzetta_pellet_level'], now = () => Date.now() } = {}) {
  const state = {
    requests: [],
    writes: [],
    /** HTTP status forced on a path ('/userLogin'…), or 'network' to fail the connection. */
    failures: new Map(),
    /** 'waiting' answers of a job before it completes. */
    jobWaits: 1,
    /** Final status of the next jobs ('completed', 'error'…), by kind. */
    jobResult: { read: 'completed', write: 'completed' },
    tokenLifetime: 3600,
    tokens: new Set(),
    refreshTokens: new Set(),
    counter: 0,
    stoves: new Map(),
    jobs: new Map(),
  };
  for (const name of stoves) {
    const fixture = loadStove(name);
    state.stoves.set(fixture.stove.id_device, { fixture, words: bufferOf(fixture.buffer) });
  }

  const answer = (status, body) =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const newToken = () => {
    state.counter += 1;
    const token = jwt({ exp: Math.floor(now() / 1000) + state.tokenLifetime, n: state.counter });
    state.tokens.add(token);
    return token;
  };

  const authorized = (headers) => {
    const token = headers.Authorization;
    if (!state.tokens.has(token)) {
      return false;
    }
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
    return exp * 1000 > now();
  };

  const stoveOf = (body) => state.stoves.get(body?.id_device);

  async function fetch(url, init = {}) {
    const { pathname, host } = new URL(url);
    const headers = init.headers ?? {};
    const body = init.body ? JSON.parse(init.body) : undefined;
    state.requests.push({ method: init.method, host, path: pathname, headers, body });
    const path = pathname.startsWith('/api/bridge/') ? '/userLogin' : pathname;
    const forced = state.failures.get(path);
    if (forced === 'network') {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (forced) {
      return answer(forced, { error: 'forced' });
    }
    switch (path) {
      case '/appSignup':
        return answer(201, { result: 'ok' });
      case '/userLogin':
        if (body?.email !== ACCOUNT.email || body?.password !== ACCOUNT.password) {
          return answer(401, { error: 'wrong credentials' });
        }
        {
          state.counter += 1;
          const refreshToken = `refresh-${state.counter}`;
          state.refreshTokens.add(refreshToken);
          return answer(200, { token: newToken(), refresh_token: refreshToken });
        }
      case '/refreshToken':
        return state.refreshTokens.has(body?.refresh_token)
          ? answer(201, { token: newToken() })
          : answer(401, { error: 'bad refresh token' });
      default:
        break;
    }
    if (!authorized(headers)) {
      return answer(401, { error: 'token expired' });
    }
    if (path === '/deviceList') {
      return answer(200, { device: [...state.stoves.values()].map((s) => s.fixture.stove) });
    }
    if (path === '/deviceGetInfo') {
      const stove = stoveOf(body);
      return stove
        ? answer(200, { device_info: [{ id_registers_map: stove.fixture.stove.id_registers_map }] })
        : answer(404, { error: 'unknown device' });
    }
    if (path === '/deviceGetRegistersMap') {
      const stove = stoveOf(body);
      return answer(200, {
        device_registers_map: {
          registers_map: [
            { id: 999, registers: [] },
            { id: stove.fixture.stove.id_registers_map, registers: stove.fixture.registers },
          ],
        },
      });
    }
    if (path === '/deviceGetBufferReading' || path === '/deviceRequestWriting') {
      const stove = stoveOf(body);
      if (!stove) {
        return answer(404, { error: 'unknown device' });
      }
      state.counter += 1;
      const idRequest = `job-${state.counter}`;
      const kind = path === '/deviceGetBufferReading' ? 'read' : 'write';
      if (kind === 'write') {
        state.writes.push({ id_device: body.id_device, ...body });
        body.Items.forEach((offset, i) => {
          const mask = body.Masks[i];
          const word = stove.words.get(offset) ?? 0;
          stove.words.set(offset, (word & ~mask) | (body.Values[i] & mask));
        });
      }
      state.jobs.set(idRequest, {
        kind,
        stove,
        waits: state.jobWaits,
        result: state.jobResult[kind],
      });
      return answer(200, { idRequest });
    }
    if (path.startsWith('/deviceJobStatus/')) {
      const job = state.jobs.get(decodeURIComponent(path.slice('/deviceJobStatus/'.length)));
      if (!job) {
        return answer(404, { error: 'unknown job' });
      }
      if (job.waits > 0) {
        job.waits -= 1;
        return answer(200, { jobAnswerStatus: 'waiting' });
      }
      if (job.result === 'garbled') {
        return answer(200, {
          jobAnswerStatus: 'completed',
          jobAnswerData: { Items: [1, 2], Values: [3] },
        });
      }
      if (job.result !== 'completed') {
        return answer(200, { jobAnswerStatus: job.result });
      }
      if (job.kind === 'write') {
        return answer(200, { jobAnswerStatus: 'completed', jobAnswerData: { Cmd: 'W' } });
      }
      const offsets = [...job.stove.words.keys()].sort((a, b) => a - b);
      return answer(200, {
        jobAnswerStatus: 'completed',
        jobAnswerData: { Items: offsets, Values: offsets.map((o) => job.stove.words.get(o)) },
      });
    }
    return answer(404, { error: 'not found' });
  }

  return {
    fetch,
    state,
    /** Changes a word of a stove buffer, as the stove itself would. */
    setWord(idDevice, offset, value) {
      state.stoves.get(idDevice).words.set(offset, value);
    },
    word(idDevice, offset) {
      return state.stoves.get(idDevice).words.get(offset);
    },
    paths() {
      return state.requests.map((r) => r.path);
    },
  };
}
