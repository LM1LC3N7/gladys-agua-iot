// -----------------------------------------------------------------------------
// The Agua IOT cloud of Micronova: the only network access of the integration.
//
// Port of the `aguaiot` class of the Python library (fredericvl/py-agua-iot,
// as maintained in vincentwolsink/home_assistant_micronova_agua_iot): the app
// registers a phone id, logs in with the e-mail and password of the vendor
// app, then sends the JWT on every call and refreshes it when it expires.
// Reading or writing a stove is a job: the cloud answers an `idRequest`, and
// /deviceJobStatus/<id> says when the stove answered.
//
// The password, the tokens and the headers are never logged nor put in an
// error message.
// -----------------------------------------------------------------------------

import { TIMINGS } from './constants.js';

const PATHS = {
  SIGNUP: '/appSignup',
  LOGIN: '/userLogin',
  REFRESH: '/refreshToken',
  DEVICES: '/deviceList',
  DEVICE_INFO: '/deviceGetInfo',
  REGISTERS: '/deviceGetRegistersMap',
  READ: '/deviceGetBufferReading',
  JOB: '/deviceJobStatus/',
  WRITE: '/deviceRequestWriting',
};

/** Version announced by the vendor apps that log in through a bridge. */
const APPLICATION_VERSION = '1.9.7';
/** The date the vendor apps send to get the whole register map. */
const REGISTERS_SINCE = '2018-06-03T08:59:54.043';

export class AguaIotError extends Error {}
/** The cloud refused the e-mail or the password (or the app id). */
export class AguaIotUnauthorized extends AguaIotError {}
/** The cloud could not be reached, or did not answer in time. */
export class AguaIotConnectionError extends AguaIotError {}

/** The `exp` claim of a JWT (seconds), without checking its signature. */
export function tokenExpiry(token) {
  try {
    const part = String(token).split('.')[1];
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return Number.isFinite(claims?.exp) ? claims.exp : null;
  } catch {
    return null;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class AguaIotClient {
  /**
   * @param {object} options
   * @param {object} options.endpoint an entry of ENDPOINTS
   * @param {string} options.email
   * @param {string} options.password
   * @param {string} options.appId the phone id registered for this installation
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now] milliseconds
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {object} [options.logger]
   */
  constructor({
    endpoint,
    email,
    password,
    appId,
    fetch = globalThis.fetch,
    now = Date.now,
    sleep = defaultSleep,
    logger,
  }) {
    this.endpoint = endpoint;
    this.apiUrl = endpoint.apiUrl.replace(/\/+$/, '');
    this.email = email;
    this.password = password;
    this.appId = appId;
    this.fetch = fetch;
    this.now = now;
    this.sleep = sleep;
    this.logger = logger;
    this.token = null;
    this.refreshToken = null;
    this.expires = 0;
  }

  headers(extra = {}) {
    const headers = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/json',
      Origin: 'file://',
      id_brand: this.endpoint.brandId ?? '1',
      customer_code: this.endpoint.customerCode,
    };
    if (this.endpoint.brand) {
      headers.brand = this.endpoint.brand;
    }
    return { ...headers, ...extra };
  }

  /** One HTTP request; never logs its headers nor its body. */
  async request(method, url, { headers, body } = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMINGS.httpTimeout),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new AguaIotConnectionError(`${new URL(url).host}: ${reason}`);
    }
    let data = null;
    const text = await response.text().catch(() => '');
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    this.logger?.debug?.(`${method} ${new URL(url).pathname} -> ${response.status}`);
    return { status: response.status, data };
  }

  /** Registers the phone id of this installation (once per login, like the app). */
  async signup() {
    const { status } = await this.request('POST', this.apiUrl + PATHS.SIGNUP, {
      headers: this.headers(),
      body: {
        phone_type: 'Android',
        phone_id: this.appId,
        phone_version: '1.0',
        language: 'en',
        id_app: this.appId,
        push_notification_token: this.appId,
        push_notification_active: false,
      },
    });
    if (status !== 201) {
      throw new AguaIotUnauthorized(`the app registration was refused (HTTP ${status})`);
    }
  }

  async login() {
    let url = this.apiUrl + PATHS.LOGIN;
    let headers = this.headers({ local: 'true', Authorization: this.appId });
    if (this.endpoint.loginUrl) {
      // Piazzetta and Superior log in through their own bridge.
      url = this.endpoint.loginUrl;
      headers = {
        ...headers,
        applicationversion: APPLICATION_VERSION,
        url: PATHS.LOGIN.slice(1),
        userid: 'null',
        aguaid: 'null',
      };
    }
    const { status, data } = await this.request('POST', url, {
      headers,
      body: { email: this.email, password: this.password },
    });
    if (status !== 200 || typeof data?.token !== 'string') {
      throw new AguaIotUnauthorized(`the login was refused (HTTP ${status})`);
    }
    this.setToken(data.token);
    this.refreshToken = data.refresh_token ?? null;
  }

  setToken(token) {
    this.token = token;
    const exp = tokenExpiry(token);
    // A token without expiry is refreshed after a while, to stay safe.
    this.expires = exp ? exp * 1000 : this.now() + TIMINGS.tokenFallbackLifetime;
  }

  /** Signup, then login: what the vendor app does when it starts. */
  async connect() {
    await this.signup();
    await this.login();
  }

  async refresh() {
    if (!this.refreshToken) {
      await this.login();
      return;
    }
    const { status, data } = await this.request('POST', this.apiUrl + PATHS.REFRESH, {
      headers: this.headers(),
      body: { refresh_token: this.refreshToken },
    });
    if (status !== 201 || typeof data?.token !== 'string') {
      this.logger?.info?.('Token refresh refused: logging in again');
      await this.login();
      return;
    }
    this.setToken(data.token);
  }

  /** An authenticated call: refreshes the token when needed, once on a 401. */
  async call(method, path, body) {
    if (!this.token) {
      await this.login();
    } else if (this.now() >= this.expires - TIMINGS.tokenMargin) {
      await this.refresh();
    }
    const send = () =>
      this.request(method, this.apiUrl + path, {
        headers: this.headers({ local: 'false', Authorization: this.token }),
        body: method === 'GET' ? undefined : body,
      });
    let answer = await send();
    if (answer.status === 401) {
      await this.refresh();
      answer = await send();
    }
    if (answer.status === 401) {
      throw new AguaIotUnauthorized(`${path}: access refused`);
    }
    if (answer.status !== 200 || answer.data === null) {
      throw new AguaIotError(`${path}: HTTP ${answer.status}`);
    }
    return answer.data;
  }

  /** The stoves of the account, with the id of their register map. */
  async listStoves() {
    const data = await this.call('POST', PATHS.DEVICES, {});
    const stoves = [];
    for (const dev of Array.isArray(data?.device) ? data.device : []) {
      const info = await this.call('POST', PATHS.DEVICE_INFO, {
        id_device: dev.id_device,
        id_product: dev.id_product,
      });
      const details = Array.isArray(info?.device_info) ? info.device_info[0] : undefined;
      if (!details) {
        throw new AguaIotError('no information about a stove');
      }
      stoves.push({
        id: dev.id,
        idDevice: dev.id_device,
        idProduct: dev.id_product,
        serial: dev.product_serial,
        name: dev.name,
        online: dev.is_online !== false,
        product: dev.name_product,
        idRegistersMap: details.id_registers_map,
      });
    }
    return stoves;
  }

  /** The register maps of a stove model (see registersOf). */
  registersMap(stove) {
    return this.call('POST', PATHS.REGISTERS, {
      id_device: stove.idDevice,
      id_product: stove.idProduct,
      last_update: REGISTERS_SINCE,
    });
  }

  /** Waits for a job, 1 s then 2 s, 3 s… until it is not "waiting" any more. */
  async waitJob(idRequest, timeout) {
    const deadline = this.now() + timeout;
    let delay = TIMINGS.jobFirstDelay;
    for (;;) {
      await this.sleep(delay);
      const answer = await this.call('GET', PATHS.JOB + encodeURIComponent(idRequest));
      if (answer?.jobAnswerStatus !== 'waiting') {
        return answer;
      }
      if (this.now() + delay + TIMINGS.jobFirstDelay > deadline) {
        throw new AguaIotConnectionError('the stove did not answer in time');
      }
      delay += TIMINGS.jobFirstDelay;
    }
  }

  /** Reads the buffer of a stove: jobAnswerData { Items: offsets, Values }. */
  async readBuffer(stove) {
    const job = await this.call('POST', PATHS.READ, {
      id_device: stove.idDevice,
      id_product: stove.idProduct,
      BufferId: 1,
    });
    if (!job?.idRequest) {
      throw new AguaIotError('the buffer reading was not accepted');
    }
    const answer = await this.waitJob(job.idRequest, TIMINGS.readTimeout);
    if (answer?.jobAnswerStatus !== 'completed' || !answer.jobAnswerData) {
      throw new AguaIotError(`buffer reading ${answer?.jobAnswerStatus ?? 'failed'}`);
    }
    return answer.jobAnswerData;
  }

  /**
   * Asks the stove to write registers ([{ offset, mask, value }]). Resolves
   * with the idRequest of the job: confirmWrite waits for it.
   */
  async requestWrite(stove, writes) {
    const job = await this.call('POST', PATHS.WRITE, {
      id_device: stove.idDevice,
      id_product: stove.idProduct,
      Protocol: 'RWMSmaster',
      BitData: writes.map(() => 8),
      Endianess: writes.map(() => 'L'),
      Items: writes.map((w) => w.offset),
      Masks: writes.map((w) => w.mask),
      Values: writes.map((w) => w.value),
    });
    if (!job?.idRequest) {
      throw new AguaIotError('the command was not accepted');
    }
    return job.idRequest;
  }

  /** Waits until the stove executed a write job (like the library: 10 checks). */
  async confirmWrite(idRequest) {
    const path = PATHS.JOB + encodeURIComponent(idRequest);
    for (let attempt = 0; attempt <= TIMINGS.writeChecks; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(TIMINGS.jobFirstDelay);
      }
      const answer = await this.call('GET', path).catch((err) => {
        if (err instanceof AguaIotUnauthorized) {
          throw err;
        }
        return null;
      });
      if (answer?.jobAnswerStatus === 'completed') {
        if (answer.jobAnswerData && 'Cmd' in answer.jobAnswerData) {
          return;
        }
        break;
      }
    }
    throw new AguaIotError('the stove did not confirm the command');
  }
}
