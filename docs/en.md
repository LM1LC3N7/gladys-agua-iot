# Micronova Agua IOT (pellet stoves)

Many pellet stove and boiler makers fit a **Micronova** Wi-Fi module and
let you control the stove with **their own phone app**, all of them built on
the same **Agua IOT** cloud. This integration logs in to that cloud with the
account of your app, like the app does, and brings your stoves into Gladys:
turn them on and off, set the temperature and the power, follow the
temperatures, the state and the alarms, and react to an alarm in a scene.

**Unofficial**: not affiliated with Micronova nor with the stove makers.

> **Development version (0.1).** Ported from the Home Assistant integration
> used by many owners, and tested against recorded register maps of seven
> real stoves, not yet against every brand. Your feedback is welcome on the
> GitHub repository.

## Compatible apps

Choose, in the configuration, the app you use on your phone:

Alfaplam · APP-O BIOEN (Unical) · Boreal Home · Bronpi Home · Darwin
Evolution (Cola) · Easy Connect, Easy Connect Plus and Easy Connect Poêle
(MCZ) · Elcofire Pellet Home · Elfire Wifi · EOSS Wifi (Solartecnik) ·
EvaCalòr – PuntoFuoco · Fontana Forni · Fonte Flamme contrôle 1 · Globe-fire
· GO HEAT (AMG) · Jolly Mec Wi-Fi · Karmek Wifi · Klover Home · LAMINOX Remote
Control 2.0 · Lorflam Home · Moretti design · My Corisit · MyPiazzetta ·
MySuperior · Nina (Micronova) · Nobis-Fi · Nordic Fire 2.0 · Ravelli Wi-Fi ·
Stufe a pellet Italia · Thermoflux · Total Control 3.0 (Extraflame) · TS Smart
(Tim Sistem) · TurboFonte (MCZ) · Wi-Phire (Linea VZ).

**Not compatible** (another platform): Ravelli Smart Wi-Fi, Total Control 1.x
and 2.0. Palazzetti stoves have their own Gladys integration.

## What you get

One Gladys device per stove of the account, with the features the stove has:

| Feature                         | In Gladys                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------ |
| On/off                          | thermostat mode: off / on                                                      |
| Setpoint                        | thermostat setpoint (room air), with the bounds and the step of the stove      |
| Water setpoint                  | thermostat setpoint of the water (hydro stoves, boilers)                       |
| Heating                         | operating state: the stove is producing heat (ignition, work, cleaning) or not |
| Room, water, smoke temperatures | temperature sensors (°C)                                                       |
| State                           | text: off, ignition, heating, cleaning, standby, shutting down, alarm…         |
| Alarm                           | binary sensor: 1 while the stove is in alarm                                   |
| Power level                     | a choice among the power levels of the stove (1 to 5 for most)                 |

The state reads like "Heating (WORK)": the phase first, the same for every
stove, then the text of the stove itself in your language when it has one.

## Installation

1. Check that your stove works in the vendor app on your phone.
2. In the configuration of the integration, choose **your stove app**, then
   type the **e-mail** and the **password** of its account.
3. Click **Test the connection**: the stoves of the account are listed.
4. Open the **Discovery** tab and add your stoves.

## Options

| Option                      | Default | Purpose                                                                           |
| --------------------------- | ------- | --------------------------------------------------------------------------------- |
| Language of the stove texts | French  | names of the features, state and alarm texts                                      |
| Refresh interval            | 60 s    | how often each stove is read (60 to 3600 s): every reading wakes it via the cloud |

## Scenes

The **Stove alarm** trigger fires when a stove goes into alarm (failed
ignition, no more pellets, smoke too hot…), once per alarm. Leave the stove
empty to watch them all. The scene gets the name of the stove, the alarm code
and text, the state, and a ready-to-send sentence, for example "Living room
stove: stove alarm (E4)" to send as a notification.

The features work in scenes like any device: turn the stove on at 6:30, set
the setpoint when you leave, check the room temperature in a condition…

## How it works

- Gladys talks to the cloud of your app over the Internet, never to the stove
  directly: the stove must be online in the app.
- The e-mail and the password stay in the Gladys configuration (the password
  is a secret field) and are only sent to the cloud of the app you chose.
- A command (on/off, setpoint, power) is a job the cloud passes to the stove:
  Gladys shows the new value at once, and reads the stove again a few seconds
  later to confirm it.
- A refused login is retried after 15 minutes, or as soon as you save the
  configuration.

## Troubleshooting

- **"refused the e-mail or the password"**: check them in the app, and that
  you chose the app you actually use (each app has its own cloud and
  accounts).
- **No stove**: the account has no stove, or the stove was added with another
  account. Log in to the app with the same e-mail.
- **A stove shown as unreachable**: the cloud could not read it (stove off the
  mains, Wi-Fi module offline): check it in the app.
- **No room temperature**: some stoves have their thermostat contact on the
  room probe, or an external thermostat: the value is then not a temperature
  and is left out.

## Credits

Ported from the Home Assistant integration
[home_assistant_micronova_agua_iot](https://github.com/vincentwolsink/home_assistant_micronova_agua_iot)
by Vincent Wolsink and contributors, based on
[py-agua-iot](https://github.com/fredericvl/py-agua-iot) by Frederic Van
Linthoudt (Apache License 2.0).
