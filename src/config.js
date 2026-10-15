// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { REFRESH_INTERVAL } from './constants.js';
import { ENDPOINTS } from './endpoints.js';
import { LANGUAGES } from './registers.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  app: '',
  email: '',
  password: '',
  language: 'fr',
  refresh_interval: REFRESH_INTERVAL.default,
};

/**
 * @returns {{ app: string, endpoint?: object, email: string, password: string,
 *   language: 'en' | 'fr', cloudLanguage: string, refreshInterval: number,
 *   missing: string[] }} `missing` lists the fields still to fill in
 */
export function normalizeConfig(raw = {}) {
  const given = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([, v]) => v !== null && v !== undefined),
  );
  const c = { ...DEFAULTS, ...given };
  const app = String(c.app ?? '').trim();
  const endpoint = Object.hasOwn(ENDPOINTS, app) ? ENDPOINTS[app] : undefined;
  const email = String(c.email ?? '').trim();
  const password = String(c.password ?? '');
  const language = Object.hasOwn(LANGUAGES, c.language) ? c.language : DEFAULTS.language;
  const interval = Number(c.refresh_interval);
  const missing = [];
  if (!endpoint) {
    missing.push('app');
  }
  if (email === '') {
    missing.push('email');
  }
  if (password === '') {
    missing.push('password');
  }
  return {
    app,
    endpoint,
    email,
    password,
    language,
    cloudLanguage: LANGUAGES[language],
    refreshInterval: Number.isFinite(interval)
      ? Math.max(REFRESH_INTERVAL.min, Math.min(REFRESH_INTERVAL.max, Math.round(interval)))
      : REFRESH_INTERVAL.default,
    missing,
  };
}
