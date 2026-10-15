# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15), its
only runtime dependency (HTTP is Node's `fetch`). It logs in to the
**Micronova Agua IOT** cloud of the vendor app the user chose, and turns the
pellet stoves of the account into Gladys devices, states, commands and a
`stove_alarm` scene trigger. Unofficial, not affiliated with Micronova.

Ported from the Home Assistant integration
`vincentwolsink/home_assistant_micronova_agua_iot` (its `aguaiot.py`,
`const.py`, `climate.py`) and `fredericvl/py-agua-iot`, both Apache-2.0: keep
the NOTICE up to date when porting more.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          AguaIotApp: login, discovery, refresh loop, commands,
                    alarm trigger, transports, connection status
src/api.js          the only network access: the Agua IOT cloud (jobs, JWT)
src/registers.js    register maps + buffer -> values, enable, descriptions,
                    raw value to write (pure)
src/formula.js      the register formulas, tokenized and parsed (pure)
src/stove.js        registers -> layout, phase, temperatures, setpoints (pure)
src/devices.js      stove -> Gladys device and states (pure)
src/endpoints.js    the 35 vendor apps: URL, customer code, brand
src/storage.js      the phone id registered with the cloud, kept in /data
src/config.js       config_schema normalized
src/constants.js    manifest keys, feature keys, limits, timings
src/i18n.js         runtime texts (en/fr)
test/fixtures/      register maps of seven real stoves (see its README)
test/helpers/       a fake Agua IOT cloud (fetch); Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `stove:<id_device lowercased>`,
  feature = `<device>:<key>` with the keys of `FEATURES` (constants.js).
- Manifest keys are frozen: the `app` option values (endpoints.js keys),
  `test_connection`, `stove_alarm` and its fields and variables.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network. Gladys: 300 states/min, 300 scene events/min.
- Never log or put in a status message the password, the e-mail, a token or
  a request header (test/api.test.js checks it).
- Formulas are interpreted, never evaluated as code.
- Commands answer Gladys within 5 s (`TIMINGS.commandAck`): wait for the
  cloud in the background beyond that.
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
