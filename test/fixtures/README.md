# Test fixtures

`stoves/*.json` are register maps of real stoves from the
[fixtures](https://github.com/vincentwolsink/home_assistant_micronova_agua_iot/tree/master/fixtures)
of the Home Assistant integration by Vincent Wolsink (Apache License 2.0),
trimmed to the registers this integration reads, with the English and French
descriptions only. Each file holds:

- `stove`: an entry of `/deviceList` (invented ids and names);
- `registers`: the registers of the stove, as `/deviceGetRegistersMap`
  lists them;
- `buffer`: the `jobAnswerData` of a buffer reading, rebuilt from the raw
  values of the original map (the words of registers sharing an offset are
  combined, like the `compute_information_dict` helper of its tests);
- `expected`: the value of each register as the Python library computed it,
  which `test/registers.test.js` compares with `src/formula.js`.

| File                     | Stove                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `piazzetta_pellet_level` | Piazzetta (MyPiazzetta), room setpoint                        |
| `nordic_fire_boiler`     | Nordic Fire boiler: three water circuits, only the puffer one |
| `jollymec_wood`          | Jolly Mec: "SIL" power level, external thermostat values      |
| `nobis_hybrid`           | Nobis hybrid wood/pellet: bit-mask enables, "MAN" setpoint    |
| `bronpi`                 | Bronpi: setpoint stored doubled                               |
| `evacalor`               | EvaCalòr: air and water, statuses without descriptions        |
| `ravelli`                | Ravelli: "- EXT" and "MAN" setpoints, "--" alarm texts        |
