// -----------------------------------------------------------------------------
// What a stove is and what it is doing, from its registers (pure).
//
// Port of the climate/sensor logic of the Home Assistant integration
// (vincentwolsink/home_assistant_micronova_agua_iot): which registers carry
// the room and water temperatures and setpoints, how the stove is turned on
// and off (`status_managed_get`: ON 85 / OFF 170), and what `status_get`
// means. The Python code compares the English status descriptions with fixed
// lists; here they are classified by keywords into a few phases, so the
// variants of every brand ("CLEANING FINAL", "M. Allarm", "STAND-BY"…) land in
// the same place.
// -----------------------------------------------------------------------------

/** Register keys. */
export const REGISTERS = {
  STATUS: 'status_get',
  COMMAND: 'status_managed_get',
  ALARM: 'alarms_get',
  POWER: 'power_set',
  SMOKE: 'temp_gas_flue_get',
};

/** Same order as the Python integration: the first enabled variant wins. */
export const AIR_VARIANTS = ['air', 'air2', 'air3', 'air_palm'];
export const WATER_VARIANTS = ['water', 'water_boiler', 'water_puffer', 'h2o', 'h2o_mandata'];

/** Values of `status_managed_get` when the register describes none. */
const COMMAND_FALLBACK = { ON: 85, OFF: 170 };

export const PHASES = {
  OFF: 'off',
  IGNITION: 'ignition',
  HEATING: 'heating',
  CLEANING: 'cleaning',
  STANDBY: 'standby',
  SHUTDOWN: 'shutdown',
  ALARM: 'alarm',
  UNKNOWN: 'unknown',
};

/** Keywords of the English status descriptions, first match wins. */
const PHASE_RULES = [
  [PHASES.ALARM, /AL+ARM|\bALM\b/],
  [PHASES.SHUTDOWN, /FINAL|SHUT ?OFF|^STOP$/],
  [PHASES.STANDBY, /STAND[ -]?BY|ECO ?STOP|RESTART/],
  [PHASES.CLEANING, /CLEAN/],
  [PHASES.IGNITION, /START|IGNITION|LOAD|LIGHT|FLAME|CHECK|CONTROL|PREP|WAIT/],
  [PHASES.HEATING, /WORK|^ON$|MODULATION/],
  [PHASES.OFF, /^OFF$/],
];

/** The usual Micronova status numbers, for the stoves that describe none. */
const STANDARD_PHASES = [
  PHASES.OFF,
  PHASES.IGNITION,
  PHASES.IGNITION,
  PHASES.IGNITION,
  PHASES.HEATING,
  PHASES.CLEANING,
  PHASES.SHUTDOWN,
  PHASES.STANDBY,
  PHASES.ALARM,
  PHASES.ALARM,
];

/** Phases where the stove counts as off (mode), and as producing heat. */
const OFF_PHASES = new Set([PHASES.OFF, PHASES.SHUTDOWN, PHASES.ALARM]);
const HEATING_PHASES = new Set([PHASES.IGNITION, PHASES.HEATING, PHASES.CLEANING, PHASES.UNKNOWN]);

/** A raw word the Wi-Fi module reports when it could not read the board. */
const READING_ERROR = 32768;
const ROOM_RANGE = { min: -30, max: 100 };
const MAX_POWER_OPTIONS = 20;

/** The phase of a status value and its English description. */
export function phaseOf(status, english) {
  if (status === null || status === undefined) {
    return PHASES.UNKNOWN;
  }
  if (status === 0) {
    // Off on every board, whatever some maps call it.
    return PHASES.OFF;
  }
  if (typeof english === 'string' && english.trim() !== '') {
    const text = english.trim().toUpperCase();
    const rule = PHASE_RULES.find(([, re]) => re.test(text));
    return rule ? rule[0] : PHASES.UNKNOWN;
  }
  return STANDARD_PHASES[status] ?? PHASES.UNKNOWN;
}

function pickKey(snapshot, variants, suffix) {
  for (const variant of variants) {
    const key = `temp_${variant}_${suffix}`;
    if (snapshot.has(key) && snapshot.enabled(key) && snapshot.value(key)) {
      return key;
    }
  }
  return null;
}

/**
 * The registers a stove uses, chosen once from a first reading like the
 * Python integration does (the features of the Gladys device follow them).
 */
export function layoutOf(snapshot) {
  const has = (key) => snapshot.has(key);
  return {
    status: has(REGISTERS.STATUS),
    command: has(REGISTERS.COMMAND),
    alarm: has(REGISTERS.ALARM),
    power: has(REGISTERS.POWER),
    smoke: has(REGISTERS.SMOKE) && snapshot.enabled(REGISTERS.SMOKE),
    roomKey: pickKey(snapshot, AIR_VARIANTS, 'get'),
    setpointKey: pickKey(snapshot, AIR_VARIANTS, 'set'),
    waterKey: pickKey(snapshot, WATER_VARIANTS, 'get'),
    waterSetpointKey: pickKey(snapshot, WATER_VARIANTS, 'set'),
  };
}

/**
 * The bounds of a setpoint: those of the register, without the end values
 * the stove gives a special meaning ("MAN", "- EXT", "TERM").
 */
export function setpointRange(snapshot, key) {
  let min = snapshot.min(key) ?? 5;
  let max = snapshot.max(key) ?? 35;
  const special = snapshot.options(key);
  while (special.has(min) && min < max) {
    min += 1;
  }
  while (special.has(max) && max > min) {
    max -= 1;
  }
  return { min, max, step: snapshot.step(key) };
}

/** The power levels of the stove: values and labels. */
export function powerOptions(snapshot, language) {
  const min = snapshot.min(REGISTERS.POWER) ?? 1;
  const max = Math.min(snapshot.max(REGISTERS.POWER) ?? 5, min + MAX_POWER_OPTIONS - 1);
  const labels = snapshot.options(REGISTERS.POWER, language);
  const options = [];
  for (let n = Math.ceil(min); n <= max; n += 1) {
    options.push({ value: n, label: labels.get(n) || String(n) });
  }
  return options;
}

/** A description worth showing: some maps fill the gaps with "--" or "____". */
const meaningful = (text) => (text && /[\p{L}\p{N}]/u.test(text) ? text : undefined);

function temperature(snapshot, key, range) {
  if (!key || snapshot.raw(key) === READING_ERROR) {
    return null;
  }
  const value = snapshot.value(key);
  // A described value is a state ("TON", "TOFF"), not a temperature.
  if (value === null || snapshot.options(key).has(value)) {
    return null;
  }
  if (range && (value < range.min || value > range.max)) {
    return null;
  }
  return value;
}

/**
 * What the stove is doing.
 * @param {import('./registers.js').Snapshot} snapshot
 * @param {ReturnType<typeof layoutOf>} layout
 * @param {string} language cloud language code (ENG, FRE…)
 */
export function readStove(snapshot, layout, language) {
  const status = layout.status ? snapshot.value(REGISTERS.STATUS) : null;
  const phase = phaseOf(status, snapshot.describe(REGISTERS.STATUS, 'ENG'));
  const known = status !== null;
  const alarm = phase === PHASES.ALARM;
  const alarmCode = layout.alarm ? snapshot.value(REGISTERS.ALARM) : null;
  return {
    status,
    phase,
    statusText: known ? meaningful(snapshot.describe(REGISTERS.STATUS, language)) : undefined,
    on: known ? !OFF_PHASES.has(phase) : null,
    heating: known ? HEATING_PHASES.has(phase) : null,
    alarm,
    alarmCode: alarm ? alarmCode : null,
    alarmText:
      alarm && alarmCode
        ? (meaningful(snapshot.describe(REGISTERS.ALARM, language)) ?? null)
        : null,
    room: temperature(snapshot, layout.roomKey, ROOM_RANGE),
    water: temperature(snapshot, layout.waterKey),
    smoke: layout.smoke ? temperature(snapshot, REGISTERS.SMOKE) : null,
    setpoint: layout.setpointKey ? snapshot.value(layout.setpointKey) : null,
    waterSetpoint: layout.waterSetpointKey ? snapshot.value(layout.waterSetpointKey) : null,
    power: layout.power ? snapshot.value(REGISTERS.POWER) : null,
  };
}

/** The value of `status_managed_get` that turns the stove on or off. */
export function commandValue(snapshot, on) {
  const wanted = on ? 'ON' : 'OFF';
  for (const [value, label] of snapshot.options(REGISTERS.COMMAND, 'ENG')) {
    if (label.toUpperCase() === wanted) {
      return value;
    }
  }
  return on ? COMMAND_FALLBACK.ON : COMMAND_FALLBACK.OFF;
}
