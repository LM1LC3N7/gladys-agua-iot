# gladys-agua-iot

[Gladys Assistant](https://gladysassistant.com) external integration for the
**pellet stoves of the Micronova Agua IOT cloud**: the stoves controlled with
MyPiazzetta, Total Control 3.0 (Extraflame), Jolly Mec Wi-Fi, Ravelli Wi-Fi,
EvaCalòr – PuntoFuoco, Fonte Flamme contrôle 1, LAMINOX Remote Control 2.0,
Nordic Fire 2.0, Thermoflux, MCZ Easy Connect and 25 other vendor apps. It
logs in like the vendor app, offers each stove of the account in the
Discovery tab, reads it at the configured interval and sends the commands
back. **Unofficial, not affiliated with Micronova** nor with the stove makers.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> Work in progress (0.1, not published to the store yet): announced on the
> [Gladys forum](https://community.gladysassistant.com/t/integrations-home-assistant-les-plus-populaires-candidates-pour-des-integrations-externes-gladys/10385/159).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (AguaIotApp) ⇄ src/api.js ⇄ Agua IOT cloud of the app
                                  ├─ src/registers.js  register maps + buffer -> values (pure)
                                  ├─ src/formula.js    the register formulas, interpreted (pure)
                                  ├─ src/stove.js      registers -> phase, temperatures, setpoints (pure)
                                  ├─ src/devices.js    stove -> Gladys device and states (pure)
                                  └─ src/endpoints.js  the 35 vendor apps (URL, customer code, brand)
```

- **Login**: the app registers a phone id (generated once, kept in `/data`),
  then logs in with the e-mail and password of the vendor app; the JWT is
  refreshed before it expires, and on a 401. MyPiazzetta and MySuperior log
  in through their own bridge.
- **Discovery**: `/deviceList`, then the register map of each stove model.
  A first reading picks the registers the stove uses (room or water
  setpoint, the enabled probes), like the Home Assistant integration.
- **Readings**: every refresh interval (one minute minimum), a buffer reading
  job per stove; the values are computed from the raw words with the mask and
  the formula of each register. Only the values that changed are sent
  (`publishChangedStates`), and only for the stoves the user added.
- **Commands**: the inverse formula gives the raw value, then a write job.
  Gladys gets its answer within 4 s; a slower stove is still confirmed in the
  background, and read again 5 s after the command.
- **Alarms**: a stove that enters an alarm state fires the `stove_alarm`
  scene trigger, once per alarm (the first reading after a start is the
  baseline).

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

The tests run against a fake Agua IOT cloud (`test/helpers/fakeCloud.js`)
built on the register maps of seven real stoves
([test/fixtures](test/fixtures/README.md)), and the SDK's fake Gladys. The
values computed by `src/formula.js` are checked against those the Python
library computed for the same stoves.

## Credits

The cloud protocol, the vendor apps list and the stove logic are ported from
[home_assistant_micronova_agua_iot](https://github.com/vincentwolsink/home_assistant_micronova_agua_iot)
by Vincent Wolsink and contributors, itself based on
[py-agua-iot](https://github.com/fredericvl/py-agua-iot) by Frederic Van
Linthoudt, both under the Apache License 2.0. See [NOTICE](NOTICE).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic is added at the first real release only.

## License

Apache-2.0.
