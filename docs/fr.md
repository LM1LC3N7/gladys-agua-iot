# Micronova Agua IOT (poêles à granulés)

De nombreux fabricants de poêles et de chaudières à granulés équipent leurs
appareils d'un module Wi-Fi **Micronova** et les font piloter par **leur
propre application**, toutes bâties sur le même cloud **Agua IOT**. Cette
intégration se connecte à ce cloud avec le compte de votre application, comme
le fait l'application, et amène vos poêles dans Gladys : les allumer et les
éteindre, régler la température et la puissance, suivre les températures,
l'état et les alarmes, et réagir à une alarme dans une scène.

**Non officielle** : sans lien avec Micronova ni avec les fabricants.

> **Version de développement (0.1).** Portée de l'intégration Home Assistant
> utilisée par de nombreux propriétaires, et testée sur les cartes de
> registres enregistrées de sept vrais poêles, pas encore sur toutes les
> marques. Vos retours sont les bienvenus sur le dépôt GitHub.

## Applications compatibles

Choisissez, dans la configuration, l'application que vous utilisez sur votre
téléphone :

Alfaplam · APP-O BIOEN (Unical) · Boreal Home · Bronpi Home · Darwin
Evolution (Cola) · Easy Connect, Easy Connect Plus et Easy Connect Poêle
(MCZ) · Elcofire Pellet Home · Elfire Wifi · EOSS Wifi (Solartecnik) ·
EvaCalòr – PuntoFuoco · Fontana Forni · Fonte Flamme contrôle 1 · Globe-fire
· GO HEAT (AMG) · Jolly Mec Wi-Fi · Karmek Wifi · Klover Home · LAMINOX Remote
Control 2.0 · Lorflam Home · Moretti design · My Corisit · MyPiazzetta ·
MySuperior · Nina (Micronova) · Nobis-Fi · Nordic Fire 2.0 · Ravelli Wi-Fi ·
Stufe a pellet Italia · Thermoflux · Total Control 3.0 (Extraflame) · TS Smart
(Tim Sistem) · TurboFonte (MCZ) · Wi-Phire (Linea VZ).

**Non compatibles** (autre plateforme) : Ravelli Smart Wi-Fi, Total Control
1.x et 2.0. Les poêles Palazzetti ont leur propre intégration
Gladys.

## Ce que vous obtenez

Un appareil Gladys par poêle du compte, avec les fonctions que le poêle
possède :

| Fonction                           | Dans Gladys                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Marche/arrêt                       | mode du thermostat : arrêt / marche                                                 |
| Consigne                           | consigne du thermostat (air ambiant), avec les bornes et le pas du poêle            |
| Consigne de l'eau                  | consigne du thermostat pour l'eau (poêles hydro, chaudières)                        |
| Chauffe                            | état de fonctionnement : le poêle produit de la chaleur (allumage, travail…) ou non |
| Températures ambiante, eau, fumées | capteurs de température (°C)                                                        |
| État                               | texte : éteint, allumage, chauffe, nettoyage, veille, extinction, alarme…           |
| Alarme                             | capteur binaire : 1 tant que le poêle est en alarme                                 |
| Puissance                          | un choix parmi les niveaux de puissance du poêle (1 à 5 pour la plupart)            |

L'état se lit comme « Chauffe (TRAVAIL) » : la phase d'abord, la même pour
tous les poêles, puis le texte du poêle lui-même dans votre langue quand il en
a un.

## Installation

1. Vérifiez que votre poêle fonctionne dans l'application du fabricant sur
   votre téléphone.
2. Dans la configuration de l'intégration, choisissez **l'application de votre
   poêle**, puis saisissez l'**e-mail** et le **mot de passe** de son compte.
3. Cliquez sur **Tester la connexion** : les poêles du compte s'affichent.
4. Ouvrez l'onglet **Découverte** et ajoutez vos poêles.

## Options

| Option                     | Par défaut | Rôle                                                                                          |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| Langue des textes du poêle | Français   | noms des fonctions, textes de l'état et des alarmes                                           |
| Intervalle de lecture      | 60 s       | fréquence de lecture de chaque poêle (60 à 3600 s) : chaque lecture le sollicite via le cloud |

## Scènes

Le déclencheur **Alarme du poêle** se déclenche quand un poêle passe en alarme
(allumage raté, plus de granulés, fumées trop chaudes…), une fois par alarme.
Laissez le poêle vide pour les surveiller tous. La scène reçoit le nom du
poêle, le code et le texte de l'alarme, l'état et une phrase prête à envoyer,
par exemple « Poêle séjour : alarme du poêle (E4) » pour une notification.

Les fonctions s'utilisent dans les scènes comme n'importe quel appareil :
allumer le poêle à 6 h 30, baisser la consigne en partant, tester la
température ambiante dans une condition…

## Fonctionnement

- Gladys dialogue avec le cloud de votre application par Internet, jamais
  directement avec le poêle : le poêle doit être en ligne dans l'application.
- L'e-mail et le mot de passe restent dans la configuration de Gladys (le mot
  de passe est un champ secret) et ne sont envoyés qu'au cloud de
  l'application choisie.
- Une commande (marche/arrêt, consigne, puissance) est une tâche que le cloud
  transmet au poêle : Gladys affiche la nouvelle valeur tout de suite, et
  relit le poêle quelques secondes plus tard pour la confirmer.
- Une connexion refusée est retentée au bout de 15 minutes, ou dès que vous
  enregistrez la configuration.

## Dépannage

- **« a refusé l'e-mail ou le mot de passe »** : vérifiez-les dans
  l'application, et que vous avez choisi celle que vous utilisez vraiment
  (chaque application a son propre cloud et ses propres comptes).
- **Aucun poêle** : le compte n'a pas de poêle, ou le poêle a été ajouté avec
  un autre compte. Connectez-vous à l'application avec le même e-mail.
- **Un poêle injoignable** : le cloud n'a pas pu le lire (poêle débranché,
  module Wi-Fi hors ligne) : vérifiez dans l'application.
- **Pas de température ambiante** : certains poêles utilisent la sonde
  d'ambiance pour un contact de thermostat externe : la valeur n'est alors pas
  une température et elle est ignorée.

## Remerciements

Portée de l'intégration Home Assistant
[home_assistant_micronova_agua_iot](https://github.com/vincentwolsink/home_assistant_micronova_agua_iot)
de Vincent Wolsink et ses contributeurs, basée sur
[py-agua-iot](https://github.com/fredericvl/py-agua-iot) de Frederic Van
Linthoudt (licence Apache 2.0).
