# TODO — Micronova Agua IOT v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm run audit`, then update README, `docs/en.md`, `docs/fr.md`,
  `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).

## Status

- [x] **Milestone 1 — core** (2026-10-15): login (35 apps, Piazzetta bridge,
      JWT refresh), discovery with register maps, safe formula parser,
      layout like the HA integration (air/water variants, enable registers),
      phases across brands, on/off, setpoints, power level, temperatures,
      state, alarm and the `stove_alarm` trigger, refresh interval, commands
      confirmed in the background, transports, test button, docs en/fr.
      Tested against the fake cloud and seven real register maps only: **not
      yet against a real account**.
- [ ] **Milestone 2 — real accounts**: testers on several brands (Piazzetta,
      Extraflame, MCZ, Jolly Mec, Nordic Fire hydro); check the login of each
      app family, the job timings, a command round trip, an alarm; collect
      their register maps (anonymized) as fixtures.
- [ ] **Milestone 3 — more features**: fan/ventilation levels and
      canalizations (`vent_*`, `canalization_*`, `multifire_*` of the HA
      climate), hybrid wood/pellet power, pellet level and "pellets depleted",
      ECO stop / standby switches, working hours, clock sync, the HA
      `reading_error_fix` / `air_temp_fix` options if testers need them.
- [ ] **Milestone 4 — first release**: cover image, Docker image build check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## Forum

No dedicated topic for this integration. Once the 10 integrations claimed on
2026-10-15 are published, a single recap message in the general thread
(/t/10385) lists each of them with its version and capabilities.

## Decisions

- Same feature model as the Palazzetti integration of the store (thermostat
  mode = on/off, operating state, text status, unknown/binary alarm,
  text/select power), so every pellet stove looks alike in Gladys.
- The registers of a stove (which setpoint, which probes) are chosen at its
  first good reading after a start or a scan, like the HA integration does,
  and kept until the next one: the features stay stable.
- Status 0 is always "off" (HA rule); otherwise the English description is
  classified by keywords; stoves without descriptions use the usual Micronova
  numbers (0 off … 7 standby, 8/9 alarm).
- Alarm = an alarm phase only (`alarms_get` alone gives false alarms on some
  maps); the first reading after a start is the baseline, no event.
- Own refresh timer (`should_poll: false`): the stoves are read even before
  the user adds them (the layout needs a reading), one minute minimum.
- A refused login waits 15 minutes before the next attempt (no account lock),
  saving the configuration retries at once.
- The phone id registered with `/appSignup` is generated once and kept in
  `/data/agua-iot.json`, like an app installed once.
- Setpoint bounds leave out the end values the stove describes ("MAN",
  "- EXT", "TERM"); temperatures with a description (TON/TOFF), a reading
  error word (32768) or out of range are left out.
