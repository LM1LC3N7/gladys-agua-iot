// -----------------------------------------------------------------------------
// The Gladys device of a stove, and its states (pure).
//
// One device per stove of the account, offered on the Discovery screen. Its
// features follow the registers of the stove (see stove.js layoutOf), with
// the same choices as the Palazzetti integration of the store, so every
// pellet stove looks alike in Gladys:
//   - `mode`            thermostat/mode: off / heating, the on/off switch;
//   - `setpoint`        thermostat/target-temperature (air), bounds and step
//                       of the stove;
//   - `water-setpoint`  thermostat/target-temperature of the water (hydro);
//   - `operating`       thermostat/operating-state: producing heat or not;
//   - `room`            temperature-sensor/decimal: the room temperature;
//   - `water`, `smoke`  temperature-sensor/probe;
//   - `status`          text: the state in words (phase, stove text, alarm);
//   - `alarm`           binary: 1 while the stove is in alarm;
//   - `power`           text/select: the power levels of the stove (Gladys
//                       has no "heat level" type).
// Feature external ids end with these keys (constants.js FEATURES): never
// rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { DEVICE_TYPE, FEATURES, LIMITS, OPERATING_STATE, THERMOSTAT_MODE } from './constants.js';
import { texts } from './i18n.js';
import { PHASES, powerOptions, setpointRange } from './stove.js';

/** The id of a stove in the external ids: its Agua IOT device id. */
export function stoveId(stove) {
  const id = String(stove.idDevice ?? stove.id ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  return id || 'unknown';
}

export const idsOf = (gladys, stove) => gladys.externalIds(DEVICE_TYPE, stoveId(stove));

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});
const command = (feature) => ({
  read_only: false,
  has_feedback: true,
  keep_history: true,
  ...feature,
});

/**
 * @param {object} gladys the SDK client (external ids)
 * @param {{ stove: object, layout: object, snapshot: object }} entry
 * @param {'en' | 'fr'} language
 * @param {string} cloudLanguage ENG, FRE…
 */
export function buildDevice(gladys, entry, language, cloudLanguage) {
  const { stove, layout, snapshot } = entry;
  const ids = idsOf(gladys, stove);
  const t = texts(language);
  const named = (key, feature) => ({
    name: t.features[key],
    external_id: ids.feature(key),
    ...feature,
  });
  const features = [];
  if (layout.status) {
    const make = layout.command ? command : sensor;
    features.push(
      named(
        FEATURES.MODE,
        make({
          category: C.THERMOSTAT,
          type: T.THERMOSTAT.MODE,
          min: THERMOSTAT_MODE.OFF,
          max: THERMOSTAT_MODE.HEATING,
          has_feedback: true,
          supported_options: [
            { value: THERMOSTAT_MODE.OFF, label: t.modes.off },
            { value: THERMOSTAT_MODE.HEATING, label: t.modes.heating },
          ],
        }),
      ),
    );
  }
  for (const [key, register] of [
    [FEATURES.SETPOINT, layout.setpointKey],
    [FEATURES.WATER_SETPOINT, layout.waterSetpointKey],
  ]) {
    if (register) {
      const { min, max, step } = setpointRange(snapshot, register);
      features.push(
        named(
          key,
          command({
            category: C.THERMOSTAT,
            type: T.THERMOSTAT.TARGET_TEMPERATURE,
            unit: U.CELSIUS,
            min,
            max,
            step,
          }),
        ),
      );
    }
  }
  if (layout.status) {
    features.push(
      named(
        FEATURES.OPERATING,
        sensor({
          category: C.THERMOSTAT,
          type: T.THERMOSTAT.OPERATING_STATE,
          min: OPERATING_STATE.IDLE,
          max: OPERATING_STATE.HEATING,
        }),
      ),
    );
  }
  const temperature = (key, type, min, max) =>
    named(key, sensor({ category: C.TEMPERATURE_SENSOR, type, unit: U.CELSIUS, min, max }));
  if (layout.roomKey) {
    features.push(temperature(FEATURES.ROOM, T.SENSOR.DECIMAL, -30, 100));
  }
  if (layout.waterKey) {
    features.push(temperature(FEATURES.WATER, T.TEMPERATURE_SENSOR.PROBE, -20, 200));
  }
  if (layout.smoke) {
    features.push(temperature(FEATURES.SMOKE, T.TEMPERATURE_SENSOR.PROBE, -20, 1000));
  }
  if (layout.status) {
    features.push(
      named(
        FEATURES.STATUS,
        sensor({ category: C.TEXT, type: T.TEXT.TEXT, keep_history: false, min: 0, max: 0 }),
      ),
      // unknown/binary: the generic binary the Gladys front labels.
      named(FEATURES.ALARM, sensor({ category: C.UNKNOWN, type: T.SENSOR.BINARY, min: 0, max: 1 })),
    );
  }
  if (layout.power) {
    features.push(
      named(
        FEATURES.POWER,
        command({
          category: C.TEXT,
          type: T.TEXT.SELECT,
          keep_history: false,
          min: 0,
          max: 0,
          supported_options: powerOptions(snapshot, cloudLanguage).map((o, i) => ({
            value: String(o.value),
            label: o.label,
            sort_order: i,
          })),
        }),
      ),
    );
  }
  const params = [];
  if (stove.product) {
    params.push({ name: 'PRODUCT', value: String(stove.product) });
  }
  return {
    name: String(stove.name || stove.product || t.stove).slice(0, LIMITS.statusText),
    external_id: ids.device,
    should_poll: false,
    params,
    features,
  };
}

/** The status in words: the phase, the stove's own text, or the alarm. */
export function statusText(reading, language) {
  const t = texts(language);
  let text;
  if (reading.alarmText) {
    text = t.alarm(reading.alarmText);
  } else if (reading.phase === PHASES.UNKNOWN) {
    text = reading.statusText ?? `${t.phases.unknown} ${reading.status}`;
  } else {
    const phase = t.phases[reading.phase];
    const own = reading.statusText;
    text = own && own.toLowerCase() !== phase.toLowerCase() ? `${phase} (${own})` : phase;
  }
  return text.slice(0, LIMITS.statusText);
}

/**
 * The states of a reading, in the publishStates format, for the features the
 * device has.
 */
export function buildStates(gladys, entry, reading, language) {
  const ids = idsOf(gladys, entry.stove);
  const { layout } = entry;
  const states = [];
  const push = (key, state) => {
    if (state !== null && state !== undefined) {
      states.push({ device_feature_external_id: ids.feature(key), state });
    }
  };
  const bool = (value) => (value === null ? null : Number(Boolean(value)));
  if (layout.status && reading.status !== null) {
    push(FEATURES.MODE, bool(reading.on));
    push(FEATURES.OPERATING, bool(reading.heating));
    push(FEATURES.ALARM, bool(reading.alarm));
    states.push({
      device_feature_external_id: ids.feature(FEATURES.STATUS),
      text: statusText(reading, language),
    });
  }
  if (layout.setpointKey) {
    push(FEATURES.SETPOINT, reading.setpoint);
  }
  if (layout.waterSetpointKey) {
    push(FEATURES.WATER_SETPOINT, reading.waterSetpoint);
  }
  if (layout.roomKey) {
    push(FEATURES.ROOM, reading.room);
  }
  if (layout.waterKey) {
    push(FEATURES.WATER, reading.water);
  }
  if (layout.smoke) {
    push(FEATURES.SMOKE, reading.smoke);
  }
  if (layout.power && reading.power !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.POWER),
      text: String(reading.power),
    });
  }
  return states;
}
