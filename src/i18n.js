// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, button, feature names, stove
// states, scene events), in English and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (names) => names.map((n) => `"${n}"`).join(', ');

export const T = {
  notConfigured: {
    en: 'Choose the app you use for your stove, then type the e-mail and the password of its account.',
    fr: "Choisissez l'application que vous utilisez pour votre poêle, puis saisissez l'e-mail et le mot de passe de son compte.",
  },
  connecting: (app) => ({
    en: `Connecting to the ${app} cloud…`,
    fr: `Connexion au cloud ${app}…`,
  }),
  connected: (app, count) => ({
    en: `Connected to ${app}: ${plural(count, 'stove', 'stoves')}. Open Discovery to add them.`,
    fr: `Connecté à ${app} : ${plural(count, 'poêle', 'poêles')}. Ouvrez Découverte pour les ajouter.`,
  }),
  noStove: (app) => ({
    en: `Connected to ${app}, but this account has no stove. Is it the account of the app you chose?`,
    fr: `Connecté à ${app}, mais ce compte n'a aucun poêle. Est-ce bien le compte de l'application choisie ?`,
  }),
  refused: (app) => ({
    en: `${app} refused the e-mail or the password: check them in the app. Next attempt in 15 minutes, or when you save the configuration.`,
    fr: `${app} a refusé l'e-mail ou le mot de passe : vérifiez-les dans l'application. Nouvel essai dans 15 minutes, ou à l'enregistrement de la configuration.`,
  }),
  unreachable: (app, reason, seconds) => ({
    en: `The ${app} cloud is unreachable (${reason}). Next attempt in ${seconds} s.`,
    fr: `Le cloud ${app} est injoignable (${reason}). Nouvel essai dans ${seconds} s.`,
  }),
  test: {
    ok: (app, names) =>
      names.length === 0
        ? {
            en: `Login OK on ${app}, but this account has no stove.`,
            fr: `Connexion OK sur ${app}, mais ce compte n'a aucun poêle.`,
          }
        : {
            en: `Login OK on ${app}: ${plural(names.length, 'stove', 'stoves')} (${list(names)}).`,
            fr: `Connexion OK sur ${app} : ${plural(names.length, 'poêle', 'poêles')} (${list(names)}).`,
          },
    refused: (app) => ({
      en: `${app} refused the e-mail or the password: check them in the app, and that you chose the app you use.`,
      fr: `${app} a refusé l'e-mail ou le mot de passe : vérifiez-les dans l'application, et que vous avez choisi celle que vous utilisez.`,
    }),
    failed: (app, reason) => ({
      en: `The ${app} cloud did not answer as expected (${reason}).`,
      fr: `Le cloud ${app} n'a pas répondu comme prévu (${reason}).`,
    }),
  },
};

/** Device texts, in the language chosen in the configuration. */
const TEXTS = {
  en: {
    features: {
      mode: 'On/off',
      setpoint: 'Setpoint',
      'water-setpoint': 'Water setpoint',
      operating: 'Heating',
      room: 'Room temperature',
      water: 'Water temperature',
      smoke: 'Smoke temperature',
      status: 'Status',
      alarm: 'Alarm',
      power: 'Power level',
    },
    modes: { off: 'Off', heating: 'On' },
    phases: {
      off: 'Off',
      ignition: 'Ignition',
      heating: 'Heating',
      cleaning: 'Cleaning',
      standby: 'Standby',
      shutdown: 'Shutting down',
      alarm: 'Alarm',
      unknown: 'State',
    },
    alarm: (label) => (label ? `Alarm: ${label}` : 'Alarm'),
    summary: (name, label) => `${name}: stove alarm${label ? ` (${label})` : ''}`,
    stove: 'Stove',
  },
  fr: {
    features: {
      mode: 'Marche/arrêt',
      setpoint: 'Consigne',
      'water-setpoint': "Consigne de l'eau",
      operating: 'Chauffe',
      room: 'Température ambiante',
      water: "Température de l'eau",
      smoke: 'Température des fumées',
      status: 'État',
      alarm: 'Alarme',
      power: 'Puissance',
    },
    modes: { off: 'Arrêt', heating: 'Marche' },
    phases: {
      off: 'Éteint',
      ignition: 'Allumage',
      heating: 'Chauffe',
      cleaning: 'Nettoyage',
      standby: 'Veille',
      shutdown: 'Extinction',
      alarm: 'Alarme',
      unknown: 'État',
    },
    alarm: (label) => (label ? `Alarme : ${label}` : 'Alarme'),
    summary: (name, label) => `${name} : alarme du poêle${label ? ` (${label})` : ''}`,
    stove: 'Poêle',
  },
};

export const texts = (language) => TEXTS[language] ?? TEXTS.en;
