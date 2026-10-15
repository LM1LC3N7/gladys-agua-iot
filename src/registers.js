// -----------------------------------------------------------------------------
// The registers of a stove (pure).
//
// The cloud describes every stove model by a register map: a register has a
// key (`status_get`, `temp_air_set`…), a buffer offset and a bit mask, a
// formula and its inverse, min/max/step, and optional value descriptions in
// several languages (`enc_val`). A reading of the stove buffer gives the raw
// word of each offset. A Snapshot joins both, like the Device class of the
// Python library: value, enabled flag, descriptions, and the raw value to
// write for a command.
// -----------------------------------------------------------------------------

import { FormulaError, evaluate } from './formula.js';

/** Language codes of the cloud descriptions. */
export const LANGUAGES = { en: 'ENG', fr: 'FRE' };
const FALLBACK_LANGUAGE = 'ENG';

/**
 * The registers of one stove, from the /deviceGetRegistersMap answer.
 * @returns {Record<string, object>} keyed by lowercase reg_key
 */
export function registersOf(answer, idRegistersMap) {
  const maps = answer?.device_registers_map?.registers_map;
  if (!Array.isArray(maps)) {
    throw new Error('unexpected register map answer');
  }
  const registers = {};
  for (const map of maps) {
    if (String(map?.id) !== String(idRegistersMap) || !Array.isArray(map.registers)) {
      continue;
    }
    for (const reg of map.registers) {
      if (typeof reg?.reg_key === 'string') {
        registers[reg.reg_key.toLowerCase()] = reg;
      }
    }
  }
  return registers;
}

/**
 * The raw words of a buffer reading (jobAnswerData of /deviceJobStatus).
 * @returns {Map<number, number>} offset -> word
 */
export function bufferOf(jobAnswerData) {
  const items = jobAnswerData?.Items;
  const values = jobAnswerData?.Values;
  if (!Array.isArray(items) || !Array.isArray(values) || items.length !== values.length) {
    throw new Error('unexpected buffer reading');
  }
  const buffer = new Map();
  items.forEach((offset, i) => {
    const word = Number(values[i]);
    if (Number.isFinite(Number(offset)) && Number.isFinite(word)) {
      buffer.set(Number(offset), word);
    }
  });
  return buffer;
}

const enableKeyOf = (key) => `${key.slice(0, key.lastIndexOf('_'))}_enable`;

export class Snapshot {
  /**
   * @param {Record<string, object>} registers see registersOf
   * @param {Map<number, number>} buffer see bufferOf (empty: nothing read yet)
   */
  constructor(registers, buffer = new Map()) {
    this.registers = registers;
    /** key -> { raw, value }, value null when unreadable */
    this.values = new Map();
    for (const [key, reg] of Object.entries(registers)) {
      const offset = Number(reg.offset);
      if (!Number.isFinite(offset) || !buffer.has(offset)) {
        continue;
      }
      const mask = Number.isFinite(Number(reg.mask)) ? Number(reg.mask) : 0xffff;
      const raw = buffer.get(offset) & mask;
      let value = null;
      try {
        value = evaluate(reg.formula ?? '#', raw);
      } catch (err) {
        if (!(err instanceof FormulaError)) {
          throw err;
        }
      }
      this.values.set(key, { raw, value });
    }
  }

  has(key) {
    return Object.hasOwn(this.registers, key);
  }

  register(key) {
    return this.registers[key];
  }

  /** The value of a register, null when absent or unreadable. */
  value(key) {
    return this.values.get(key)?.value ?? null;
  }

  raw(key) {
    return this.values.get(key)?.raw ?? null;
  }

  /**
   * A register is enabled unless its `<group>_enable` register says otherwise:
   * its value must be one of `enable_val`, or 1 without that list.
   */
  enabled(key) {
    const enableKey = enableKeyOf(key);
    const reg = this.registers[enableKey];
    if (!reg || reg.reg_type !== 'ENABLE') {
      return true;
    }
    const value = this.value(enableKey);
    if (Array.isArray(reg.enable_val)) {
      return reg.enable_val.some((e) => Number(e?.value) === value);
    }
    return value === 1;
  }

  /**
   * The value descriptions of a register in a language (English when the
   * register has none in that language).
   * @returns {Map<number, string>}
   */
  options(key, language = FALLBACK_LANGUAGE) {
    const list = this.registers[key]?.enc_val;
    if (!Array.isArray(list)) {
      return new Map();
    }
    const languages = new Set(list.map((e) => e?.lang));
    const lang = languages.has(language) ? language : FALLBACK_LANGUAGE;
    return new Map(
      list
        .filter((e) => e?.lang === lang && typeof e.description === 'string')
        .map((e) => [Number(e.value), e.description.trim()]),
    );
  }

  /** The description of the current value, undefined when it has none. */
  describe(key, language) {
    const value = this.value(key);
    return value === null ? undefined : this.options(key, language).get(value);
  }

  min(key) {
    return finite(this.registers[key]?.set_min);
  }

  max(key) {
    return finite(this.registers[key]?.set_max);
  }

  step(key) {
    const step = finite(this.registers[key]?.step);
    return step !== null && step > 0 ? step : 1;
  }
}

function finite(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}

/**
 * The raw value to write for a displayed value: bounds of the register, then
 * its inverse formula, truncated to an integer, then the "hex" quirk of some
 * registers (decimal digits read as hexadecimal), like the Python library.
 * @returns {{ offset: number, mask: number, value: number }}
 */
export function encodeWrite(register, value) {
  const n = Number(value);
  if (!register || !Number.isFinite(n)) {
    throw new Error('invalid value');
  }
  const min = finite(register.set_min);
  const max = finite(register.set_max);
  if ((min !== null && n < min) || (max !== null && n > max)) {
    throw new RangeError(`the value must be between ${min} and ${max}`);
  }
  let raw = Math.trunc(evaluate(register.formula_inverse ?? '#', n));
  if (register.is_hex) {
    raw = Number.parseInt(String(raw), 16);
  }
  return { offset: Number(register.offset), mask: Number(register.mask ?? 0xffff), value: raw };
}
