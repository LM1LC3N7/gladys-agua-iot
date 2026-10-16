# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- README: the store install note replaces the work-in-progress notice, and the
  Releasing section no longer says the store topic is still to be added.

## [0.1.1] - 2026-10-15

### Added

- Login to the Agua IOT cloud of the 35 vendor apps of the Home Assistant
  integration (MyPiazzetta, Total Control 3.0, Jolly Mec Wi-Fi, Ravelli Wi-Fi,
  MCZ Easy Connect…), with the e-mail and the password of the app; JWT
  refreshed before it expires and on a 401; MyPiazzetta and MySuperior
  through their bridge.
- One Gladys device per stove of the account, with the features its
  registers offer: on/off (thermostat mode), room and water setpoints with
  the bounds and step of the stove, operating state, room, water and smoke
  temperatures, state text, alarm, power level.
- The register formulas of the cloud, interpreted by a safe parser checked
  against the values of the Python library on seven real register maps.
- The states of every phase (ignition, heating, cleaning, standby, shutting
  down, alarm…) recognized across brands, in English or French.
- The "Stove alarm" scene trigger, once per alarm, with the alarm code and
  text and a ready-to-send sentence.
- Refresh interval from 60 to 3600 seconds; only the changed values are sent.
- Commands confirmed by the stove, answered to Gladys within 4 seconds, and
  a reading of the stove 5 seconds after each command.
- Cloud transport badge per stove (unreachable when it cannot be read).
- "Test the connection" button.

[Unreleased]: https://github.com/LM1LC3N7/gladys-agua-iot/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-agua-iot/releases/tag/v0.1.1
