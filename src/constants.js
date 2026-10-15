// -----------------------------------------------------------------------------
// Keys shared with the manifest (frozen: users store them in their scenes and
// configuration) and the tuning of the integration.
// -----------------------------------------------------------------------------

/** Manifest `actions` keys. */
export const ACTIONS = {
  TEST: 'test_connection',
};

/** Manifest `scene_triggers` keys. */
export const SCENE_TRIGGERS = {
  STOVE_ALARM: 'stove_alarm',
};

/** Refresh interval of the stoves (seconds), mirrored by the manifest. */
export const REFRESH_INTERVAL = { min: 60, max: 3600, default: 60 };

/** Device type of the external ids: ext:<selector>:stove:<id_device>. */
export const DEVICE_TYPE = 'stove';

/** Feature keys, the end of the feature external ids: never rename one. */
export const FEATURES = {
  MODE: 'mode',
  SETPOINT: 'setpoint',
  WATER_SETPOINT: 'water-setpoint',
  OPERATING: 'operating',
  ROOM: 'room',
  WATER: 'water',
  SMOKE: 'smoke',
  STATUS: 'status',
  ALARM: 'alarm',
  POWER: 'power',
};

/** Gladys core values (server/utils/constants.js). */
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1 };
export const OPERATING_STATE = { IDLE: 0, HEATING: 1 };

export const LIMITS = {
  /** Scene event strings. */
  eventText: 1000,
  /** Status texts. */
  statusText: 200,
  /** Stoves handled for one account. */
  stoves: 20,
};

export const TIMINGS = {
  /** One HTTP request to the cloud. */
  httpTimeout: 30_000,
  /** A stove buffer reading, job included (the library default). */
  readTimeout: 30_000,
  /** First wait of a job; the next ones grow by this much. */
  jobFirstDelay: 1000,
  /** Checks of a write job before giving up (the library default). */
  writeChecks: 10,
  /** How long a command waits for the stove before Gladys gets its answer. */
  commandAck: 4000,
  /** Refresh of a stove after a command, so Gladys shows what it did. */
  refreshAfterCommand: 5000,
  /** A token is refreshed this long before it expires. */
  tokenMargin: 60_000,
  /** Lifetime given to a token whose expiry cannot be read. */
  tokenFallbackLifetime: 10 * 60_000,
  /** After a refused login, the next attempt waits this long (no account lock). */
  authRetry: 15 * 60_000,
  /** An unchanged value is re-sent this often, so it stays recently dated in Gladys. */
  stateHeartbeat: 30 * 60_000,
};
