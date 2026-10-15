// -----------------------------------------------------------------------------
// The integration: one account on the Agua IOT cloud of the chosen app, the
// stoves of that account as Gladys devices, refreshed at the configured
// interval, their commands, and the "stove alarm" scene trigger. index.js
// only wires the SDK handlers to it (src/handlers.js).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { AguaIotClient, AguaIotUnauthorized } from './api.js';
import { normalizeConfig } from './config.js';
import {
  DEVICE_TYPE,
  FEATURES,
  LIMITS,
  SCENE_TRIGGERS,
  THERMOSTAT_MODE,
  TIMINGS,
} from './constants.js';
import { buildDevice, buildStates, idsOf, statusText, stoveId } from './devices.js';
import { T, texts } from './i18n.js';
import { Snapshot, bufferOf, encodeWrite, registersOf } from './registers.js';
import { loadAppId as defaultLoadAppId } from './storage.js';
import {
  REGISTERS,
  commandValue,
  layoutOf,
  powerOptions,
  readStove,
  setpointRange,
} from './stove.js';

const clip = (text) => String(text ?? '').slice(0, LIMITS.eventText);

/** A short reason for a status message: never a token, a password or a header. */
const reasonOf = (err) => clip(err?.message ?? err).slice(0, 120);

export class AguaIotApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'agua-iot' }),
    createClient = (options) => new AguaIotClient(options),
    loadAppId = defaultLoadAppId,
    now = Date.now,
    timers = globalThis,
    sleep,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.createClient = createClient;
    this.loadAppId = loadAppId;
    this.now = now;
    this.timers = timers;
    this.sleep = sleep;
    this.config = normalizeConfig();
    this.configKey = undefined;
    this.appId = undefined;
    this.client = null;
    /** stove id -> { stove, registers, layout, snapshot, reading, ok, failing, queue } */
    this.stoves = new Map();
    this.connected = false;
    this.timer = undefined;
    this.refreshTimers = new Map();
    this.generation = 0;
    this.running = undefined;
    this.nextAttemptAt = 0;
    this.lastStatus = undefined;
    /** device external id -> transport last published */
    this.transports = new Map();
  }

  get label() {
    return this.config.endpoint?.label ?? 'Agua IOT';
  }

  // --- Lifecycle -------------------------------------------------------------

  /**
   * @param {object} raw the configuration
   * @param {{ force?: boolean }} options force: log in again even with the same
   * configuration (the user saved it), instead of a resync
   */
  async start(raw = {}, { force = false } = {}) {
    const config = normalizeConfig(raw);
    const key = JSON.stringify(config);
    if (!force && key === this.configKey && this.client) {
      // Gladys reconnected, same configuration: resend what Gladys may have lost.
      await this.resync();
      return;
    }
    this.stop();
    this.config = config;
    this.configKey = key;
    this.nextAttemptAt = 0;
    if (config.missing.length > 0) {
      await this.setStatus(false, T.notConfigured);
      return;
    }
    await this.setStatus(false, T.connecting(this.label));
    this.appId ??= await this.loadAppId({ logger: this.logger });
    this.client = this.newClient();
    const generation = this.generation;
    this.timer = this.timers.setInterval(() => {
      if (generation === this.generation) {
        this.tick().catch((err) => this.logger.error(`Refresh failed: ${err.message}`));
      }
    }, config.refreshInterval * 1000);
    await this.tick();
  }

  newClient() {
    return this.createClient({
      endpoint: this.config.endpoint,
      email: this.config.email,
      password: this.config.password,
      appId: this.appId,
      logger: this.logger,
      now: this.now,
      ...(this.sleep ? { sleep: this.sleep } : {}),
    });
  }

  stop() {
    this.generation += 1;
    this.timers.clearInterval(this.timer);
    this.timer = undefined;
    for (const timer of this.refreshTimers.values()) {
      this.timers.clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.client = null;
    this.connected = false;
    this.running = undefined;
    this.stoves.clear();
    this.configKey = undefined;
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Refresh loop ----------------------------------------------------------

  /** One round: connect and discover when needed, else read every stove. */
  tick() {
    if (!this.running) {
      const generation = this.generation;
      this.running = this.round(generation).finally(() => {
        if (generation === this.generation) {
          this.running = undefined;
        }
      });
    }
    return this.running;
  }

  async round(generation) {
    if (!this.client || this.now() < this.nextAttemptAt) {
      return;
    }
    try {
      if (!this.connected) {
        await this.discover(generation);
      } else {
        await this.refreshAll(generation);
      }
    } catch (err) {
      if (generation === this.generation) {
        await this.failed(err);
      }
    }
  }

  async failed(err) {
    this.connected = false;
    if (err instanceof AguaIotUnauthorized) {
      this.logger.warn(`${this.label}: ${err.message}`);
      this.nextAttemptAt = this.now() + TIMINGS.authRetry;
      await this.setStatus(false, T.refused(this.label));
    } else {
      this.logger.warn(`${this.label}: ${reasonOf(err)}`);
      await this.setStatus(
        false,
        T.unreachable(this.label, reasonOf(err), this.config.refreshInterval),
      );
    }
    for (const entry of this.stoves.values()) {
      entry.ok = false;
    }
    await this.publishTransports();
  }

  /** Logs in, lists the stoves and their register maps, reads them, publishes the devices. */
  async discover(generation) {
    const client = this.client;
    await client.connect();
    const stoves = (await client.listStoves()).slice(0, LIMITS.stoves);
    const entries = new Map();
    for (const stove of stoves) {
      const registers = registersOf(await client.registersMap(stove), stove.idRegistersMap);
      const id = stoveId(stove);
      // A stove already known keeps its last reading: an alarm is not raised twice.
      entries.set(id, {
        stove,
        registers,
        layout: null,
        snapshot: null,
        reading: this.stoves.get(id)?.reading ?? null,
        ok: false,
      });
    }
    if (generation !== this.generation) {
      return;
    }
    this.stoves = entries;
    this.connected = true;
    this.logger.info(`${this.label}: ${entries.size} stove(s) on the account`);
    await this.refreshAll(generation, { publish: true });
  }

  async refreshAll(generation, { publish = false } = {}) {
    let changed = publish;
    for (const entry of [...this.stoves.values()]) {
      changed = (await this.refreshStove(entry, generation)) || changed;
    }
    if (generation !== this.generation) {
      return;
    }
    if (changed) {
      await this.publishDevices();
    }
    await this.setStatus(
      true,
      this.stoves.size > 0 ? T.connected(this.label, this.stoves.size) : T.noStove(this.label),
    );
    await this.publishTransports();
  }

  /**
   * Reads one stove and publishes its states. Resolves true when the stove got
   * its layout (first good reading): the devices must be published again.
   */
  refreshStove(entry, generation = this.generation) {
    return this.serial(entry, async () => {
      const client = this.client;
      if (!client || generation !== this.generation) {
        return false;
      }
      let buffer;
      try {
        buffer = bufferOf(await client.readBuffer(entry.stove));
      } catch (err) {
        if (err instanceof AguaIotUnauthorized) {
          throw err;
        }
        if (!entry.failing) {
          this.logger.warn(`Reading "${entry.stove.name}" failed: ${reasonOf(err)}`);
        }
        entry.ok = false;
        entry.failing = true;
        return false;
      }
      if (generation !== this.generation) {
        return false;
      }
      if (entry.failing) {
        this.logger.info(`"${entry.stove.name}" answers again`);
        entry.failing = false;
      }
      const snapshot = new Snapshot(entry.registers, buffer);
      const first = !entry.layout;
      if (first) {
        entry.layout = layoutOf(snapshot);
      }
      entry.snapshot = snapshot;
      entry.ok = true;
      const reading = readStove(snapshot, entry.layout, this.config.cloudLanguage);
      this.detectAlarm(entry, entry.reading, reading);
      entry.reading = reading;
      await this.publishStates(entry);
      return first;
    });
  }

  /** Runs the cloud jobs of a stove one after the other. */
  serial(entry, fn) {
    const run = (entry.queue ?? Promise.resolve()).then(fn);
    entry.queue = run.catch(() => {});
    return run;
  }

  scheduleRefresh(entry) {
    const id = stoveId(entry.stove);
    this.timers.clearTimeout(this.refreshTimers.get(id));
    const generation = this.generation;
    this.refreshTimers.set(
      id,
      this.timers.setTimeout(() => {
        this.refreshTimers.delete(id);
        if (generation === this.generation && this.connected) {
          this.refreshStove(entry, generation)
            .then((first) => (first ? this.publishDevices() : undefined))
            .then(() => this.publishTransports())
            .catch((err) => this.logger.warn(`Refresh after a command failed: ${err.message}`));
        }
      }, TIMINGS.refreshAfterCommand),
    );
  }

  // --- Publication -----------------------------------------------------------

  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((d) => d.external_id));
  }

  async publishDevices() {
    const devices = [];
    for (const entry of this.stoves.values()) {
      if (!entry.layout) {
        continue;
      }
      const device = buildDevice(
        this.gladys,
        entry,
        this.config.language,
        this.config.cloudLanguage,
      );
      if (device.features.length > 0) {
        devices.push(device);
      } else if (!entry.unsupported) {
        // A register map without any register this integration knows.
        entry.unsupported = true;
        this.logger.warn(`"${entry.stove.name}" (${entry.stove.product}): no known register`);
      }
    }
    await this.gladys
      .publishDiscoveredDevices(devices)
      .catch((err) => this.logger.warn(`Publishing the discovered devices failed: ${err.message}`));
  }

  async publishStates(entry) {
    if (!entry.reading || !this.createdDevices().has(idsOf(this.gladys, entry.stove).device)) {
      return;
    }
    const states = buildStates(this.gladys, entry, entry.reading, this.config.language);
    await this.gladys
      .publishChangedStates(states, { heartbeat: TIMINGS.stateHeartbeat })
      .catch((err) => this.logger.warn(`Sending the states failed: ${err.message}`));
  }

  transportOf(entry) {
    return this.connected && entry.ok && entry.stove.online
      ? DEVICE_TRANSPORTS.CLOUD
      : DEVICE_TRANSPORTS.UNREACHABLE;
  }

  async publishTransports() {
    const created = this.createdDevices();
    const entries = [];
    for (const entry of this.stoves.values()) {
      const externalId = idsOf(this.gladys, entry.stove).device;
      const transport = this.transportOf(entry);
      if (created.has(externalId) && this.transports.get(externalId) !== transport) {
        this.transports.set(externalId, transport);
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  /** Gladys reconnected: publish again what it may have lost. */
  async resync() {
    this.transports.clear();
    if (!this.connected) {
      await this.tick();
      return;
    }
    await this.publishDevices();
    this.gladys.forgetPublishedStates();
    for (const entry of this.stoves.values()) {
      await this.publishStates(entry);
    }
    await this.publishTransports();
  }

  /** The "stove alarm" scene trigger, once per alarm (the first reading is the baseline). */
  detectAlarm(entry, previous, current) {
    if (!previous || !current.alarm) {
      return;
    }
    if (previous.alarm && previous.alarmCode === current.alarmCode) {
      return;
    }
    const name = entry.stove.name || entry.stove.product || texts(this.config.language).stove;
    const label = current.alarmText ?? current.statusText ?? null;
    this.logger.warn(`"${name}" is in alarm${label ? ` (${label})` : ''}`);
    this.gladys
      .publishSceneEvent(SCENE_TRIGGERS.STOVE_ALARM, {
        stove: idsOf(this.gladys, entry.stove).device,
        stove_name: clip(name),
        alarm_code: current.alarmCode,
        alarm_label: clip(label ?? ''),
        status: clip(statusText(current, this.config.language)),
        summary: clip(texts(this.config.language).summary(name, label)),
      })
      .catch((err) => this.logger.warn(`Scene event failed: ${err.message}`));
  }

  // --- Devices created by the user -----------------------------------------

  entryOf(externalId) {
    const prefix = this.gladys.externalId(`${DEVICE_TYPE}:`);
    const text = String(externalId ?? '');
    if (!text.startsWith(prefix)) {
      return undefined;
    }
    const [id, key] = text.slice(prefix.length).split(':');
    const entry = this.stoves.get(id);
    return entry ? { entry, key } : undefined;
  }

  async deviceCreated(device) {
    const found = this.entryOf(device?.external_id);
    if (found) {
      this.transports.delete(device.external_id);
      await this.publishStates(found.entry);
      await this.publishTransports();
    }
  }

  async deviceDeleted(device) {
    if (device?.external_id) {
      this.transports.delete(device.external_id);
    }
  }

  /** The Discovery screen asks for the stoves: list them again. */
  async scan() {
    if (!this.client) {
      return;
    }
    await this.running;
    this.connected = false;
    this.nextAttemptAt = 0;
    await this.tick();
  }

  // --- Commands --------------------------------------------------------------

  async setValue(device, feature, value) {
    const found = this.entryOf(feature?.external_id);
    if (!this.client || !this.connected) {
      throw new Error(`not connected to the ${this.label} cloud`);
    }
    const entry = found?.entry;
    if (!entry?.snapshot) {
      throw new Error('this stove has not been read yet, try again in a minute');
    }
    const { snapshot, layout } = entry;
    let register;
    let target;
    let state;
    switch (found.key) {
      case FEATURES.MODE: {
        if (!layout.command) {
          throw new Error('this stove cannot be turned on or off from the cloud');
        }
        const on = Number(value) !== THERMOSTAT_MODE.OFF;
        register = REGISTERS.COMMAND;
        target = commandValue(snapshot, on);
        state = { state: on ? THERMOSTAT_MODE.HEATING : THERMOSTAT_MODE.OFF };
        break;
      }
      case FEATURES.SETPOINT:
      case FEATURES.WATER_SETPOINT: {
        register = found.key === FEATURES.SETPOINT ? layout.setpointKey : layout.waterSetpointKey;
        if (!register) {
          throw new Error(`${feature.name ?? found.key} cannot be controlled`);
        }
        const { min, max, step } = setpointRange(snapshot, register);
        const n = Number(value);
        if (!Number.isFinite(n)) {
          throw new Error('the setpoint must be a number');
        }
        target = Math.min(max, Math.max(min, Math.round(n / step) * step));
        state = { state: target };
        break;
      }
      case FEATURES.POWER: {
        register = REGISTERS.POWER;
        target = Number(String(value).trim());
        const allowed = powerOptions(snapshot, this.config.cloudLanguage).map((o) => o.value);
        if (!layout.power || !allowed.includes(target)) {
          throw new Error(`unknown power level ${value}`);
        }
        state = { text: String(target) };
        break;
      }
      default:
        throw new Error(`${feature?.name ?? found?.key ?? 'this feature'} cannot be controlled`);
    }
    const write = encodeWrite(snapshot.register(register), target);
    await this.write(entry, [write]);
    this.logger.info(`"${entry.stove.name}": ${found.key} set to ${target}`);
    if (this.createdDevices().has(idsOf(this.gladys, entry.stove).device)) {
      // Through publishChangedStates, so the reading that follows corrects it
      // if the stove did not follow.
      await this.gladys
        .publishChangedStates([{ device_feature_external_id: feature.external_id, ...state }])
        .catch((err) => this.logger.warn(`Sending the new state failed: ${err.message}`));
    }
    this.scheduleRefresh(entry);
  }

  /**
   * Sends a write job, then waits for the stove a few seconds: Gladys gets its
   * answer in time, and a slower stove is still confirmed in the background.
   */
  async write(entry, writes) {
    const client = this.client;
    const idRequest = await this.serial(entry, () => client.requestWrite(entry.stove, writes));
    let failure;
    const confirmed = this.serial(entry, () => client.confirmWrite(idRequest)).then(
      () => 'done',
      (err) => {
        failure = err;
        return 'failed';
      },
    );
    let timer;
    const pending = new Promise((resolve) => {
      timer = this.timers.setTimeout(() => resolve('pending'), TIMINGS.commandAck);
    });
    const outcome = await Promise.race([confirmed, pending]);
    this.timers.clearTimeout(timer);
    if (outcome === 'failed') {
      throw failure;
    }
    if (outcome === 'pending') {
      confirmed.then((late) => {
        if (late === 'failed') {
          this.logger.warn(`"${entry.stove.name}": ${failure.message}`);
        }
      });
    }
  }

  // --- Configuration screen button -------------------------------------------

  /** Logs in with the saved configuration and lists the stoves. */
  async testConnection() {
    if (this.config.missing.length > 0) {
      return T.notConfigured;
    }
    this.appId ??= await this.loadAppId({ logger: this.logger });
    const client = this.newClient();
    try {
      await client.connect();
      const stoves = await client.listStoves();
      return T.test.ok(
        this.label,
        stoves.map((s) => s.name || s.product || '?'),
      );
    } catch (err) {
      return err instanceof AguaIotUnauthorized
        ? T.test.refused(this.label)
        : T.test.failed(this.label, reasonOf(err) || 'error');
    }
  }
}
