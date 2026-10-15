// -----------------------------------------------------------------------------
// The vendor apps of the Agua IOT platform: each one has its own cloud
// (API URL), customer code and sometimes a brand id. Taken from const.py of
// the Home Assistant integration (vincentwolsink/home_assistant_micronova_agua_iot).
//
// The keys are the values of the `app` select of the manifest: users store
// them, never rename one (test/manifest.test.js ties both lists).
// -----------------------------------------------------------------------------

const MCZ = 'https://remote.mcz.it';
const PIAZZETTA = 'https://piazzetta.agua-iot.com';
const PIAZZETTA_LOGIN = 'https://piazzetta-iot.app2cloud.it/api/bridge/endpoint/';
const agua = (name) => `https://${name}.agua-iot.com`;

/** @type {Record<string, { label: string, customerCode: string, apiUrl: string, loginUrl?: string, brandId?: string, brand?: string }>} */
export const ENDPOINTS = {
  alfaplam: { label: 'Alfaplam', customerCode: '862148', apiUrl: agua('alfaplam') },
  app_o_bioen: { label: 'APP-O BIOEN (Unical)', customerCode: '289982', apiUrl: agua('unical') },
  boreal_home: { label: 'Boreal Home', customerCode: '173118', apiUrl: agua('boreal') },
  bronpi_home: { label: 'Bronpi Home', customerCode: '164873', apiUrl: agua('bronpi') },
  darwin_evolution: {
    label: 'Darwin Evolution (Cola)',
    customerCode: '475219',
    apiUrl: agua('cola'),
  },
  easy_connect: { label: 'Easy Connect (MCZ)', customerCode: '354924', apiUrl: MCZ },
  easy_connect_plus: { label: 'Easy Connect Plus (MCZ)', customerCode: '746318', apiUrl: MCZ },
  easy_connect_poele: { label: 'Easy Connect Poêle (MCZ)', customerCode: '354925', apiUrl: MCZ },
  elcofire: { label: 'Elcofire Pellet Home', customerCode: '132679', apiUrl: agua('elcofire') },
  elfire: { label: 'Elfire Wifi', customerCode: '402762', apiUrl: agua('elfire') },
  eoss: { label: 'EOSS Wifi (Solartecnik)', customerCode: '326495', apiUrl: agua('solartecnik') },
  evacalor: {
    label: 'EvaCalòr – PuntoFuoco',
    customerCode: '635987',
    apiUrl: agua('evastampaggi'),
  },
  fontana_forni: { label: 'Fontana Forni', customerCode: '505912', apiUrl: agua('fontanaforni') },
  fonte_flamme: {
    label: 'Fonte Flamme contrôle 1',
    customerCode: '848324',
    apiUrl: agua('fonteflame'),
  },
  globe_fire: { label: 'Globe-fire', customerCode: '634876', apiUrl: agua('globefire') },
  go_heat: { label: 'GO HEAT (AMG)', customerCode: '859435', apiUrl: agua('amg') },
  jolly_mec: { label: 'Jolly Mec Wi-Fi', customerCode: '732584', apiUrl: agua('jollymec') },
  karmek: { label: 'Karmek Wifi', customerCode: '403873', apiUrl: agua('karmekone') },
  klover_home: { label: 'Klover Home', customerCode: '143789', apiUrl: agua('klover') },
  laminox: {
    label: 'LAMINOX Remote Control 2.0',
    customerCode: '352678',
    apiUrl: agua('laminox'),
  },
  lorflam_home: { label: 'Lorflam Home', customerCode: '121567', apiUrl: agua('lorflam') },
  moretti_design: { label: 'Moretti design', customerCode: '624813', apiUrl: agua('moretti') },
  my_corisit: { label: 'My Corisit', customerCode: '101427', apiUrl: agua('mycorisit') },
  mypiazzetta: {
    label: 'MyPiazzetta',
    customerCode: '458632',
    apiUrl: PIAZZETTA,
    loginUrl: PIAZZETTA_LOGIN,
  },
  mysuperior: {
    label: 'MySuperior',
    customerCode: '458632',
    apiUrl: PIAZZETTA,
    loginUrl: PIAZZETTA_LOGIN,
    brandId: '2',
    brand: 'superior',
  },
  nina: { label: 'Nina (Micronova)', customerCode: '999999', apiUrl: agua('micronova') },
  nobis_fi: { label: 'Nobis-Fi', customerCode: '700700', apiUrl: agua('nobis') },
  nordic_fire: { label: 'Nordic Fire 2.0', customerCode: '132678', apiUrl: agua('nordicfire') },
  ravelli: { label: 'Ravelli Wi-Fi', customerCode: '953712', apiUrl: agua('ravelli') },
  stufe_pellet_italia: {
    label: 'Stufe a pellet Italia',
    customerCode: '015142',
    apiUrl: agua('stufepelletitalia'),
  },
  thermoflux: { label: 'Thermoflux', customerCode: '391278', apiUrl: agua('thermoflux') },
  total_control_3: {
    label: 'Total Control 3.0 (Extraflame)',
    customerCode: '195764',
    apiUrl: agua('extraflame'),
  },
  ts_smart: { label: 'TS Smart (Tim Sistem)', customerCode: '046629', apiUrl: agua('timsistem') },
  turbofonte: {
    label: 'TurboFonte (MCZ)',
    customerCode: '354924',
    apiUrl: MCZ,
    brandId: '2',
    brand: 'turbofonte',
  },
  wi_phire: { label: 'Wi-Phire (Linea VZ)', customerCode: '521228', apiUrl: agua('lineavz') },
};
