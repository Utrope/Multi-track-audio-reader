# Infini – lecteur multipiste pour répéter en groupe

[![Tests](https://github.com/Utrope/Multi-track-audio-reader/actions/workflows/tests.yml/badge.svg)](https://github.com/Utrope/Multi-track-audio-reader/actions/workflows/tests.yml)

*[English](README.md) · Français* · Version 1.1 – voir le [journal des modifications](CHANGELOG.md) et la [feuille de route](ROADMAP.md) (en anglais)

**Un mélangeur dans le navigateur pour travailler un morceau instrument par instrument.**
Chaque musicien isole sa partie, choisit son niveau de difficulté, baisse ou coupe les
autres pistes, et télécharge la partition qui correspond à ce qu'il entend.

**[▶ Essayer la démo](https://utrope.github.io/Multi-track-audio-reader/)** · aucune installation, fonctionne dans le navigateur

![Interface du lecteur : une barre de temps avec une boucle A-B au-dessus de sept pistes (batterie, basse, guitare, clavier, saxophone alto / flûte, trombone / saxophone ténor, production) et une colonne générale, avec pour chacune Solo, Mute, niveau, partition, volume et lecture](docs/screenshot.png)

## Fonctionnalités

- **7 pistes jouées ensemble**, parfaitement synchronisées : batterie, basse, guitare,
  clavier, deux pupitres de vents et l'accompagnement complet.
- **3 niveaux de difficulté par instrument**, changeables en pleine lecture, sans coupure
  ni décalage.
- **Barre de temps** : voir où l'on en est dans le morceau et s'y déplacer.
- **Boucle A-B** pour répéter un passage autant de fois que nécessaire, sur toutes les
  pistes à la fois.
- **Choix de l'instrument** sur les pupitres de vents (saxophone alto ou flûte, trombone ou
  saxophone ténor).
- **Solo, Mute et volume** par piste, plus un volume général.
- **Partition PDF** de l'instrument et du niveau en cours, en un clic.
- **Utilisable au clavier**, avec des libellés pour les lecteurs d'écran ; s'adapte aux
  petits écrans.

## Points techniques

- **Web Audio API, sans dépendance ni étape de build** : HTML, CSS et JavaScript (modules ES)
  servis tels quels par GitHub Pages.
- **Lecture synchronisée à l'échantillon près** : toutes les sources sont programmées sur
  le même instant de l'horloge audio. Un changement de niveau arrête l'ancienne source et
  démarre la nouvelle au même instant exact, à la même position.
- **Boucle A-B sans coupure** : la boucle est appliquée par les sources audio elles-mêmes
  (`loop` / `loopStart` / `loopEnd`), donc à l'échantillon près et identiquement sur toutes
  les pistes. La position courante se déduit d'une seule ancre de lecture, qui reste exacte
  malgré les pauses, les déplacements et les changements de niveau.
- **Changements concurrents sans incohérence** : chaque piste garde la dernière variante
  demandée et un jeton de requête, si bien que les réponses arrivées en retard sont
  ignorées et que des clics rapides donnent toujours le bon résultat.
- **Cache LRU des pistes décodées**, qui partage aussi les chargements en cours : revenir à
  un niveau déjà écouté est instantané, avec une mémoire bornée.
- **Une seule règle de mixage** (`applyGain`) qui combine volume, mute et solo, appliquée par
  un nœud de gain par piste et un nœud de gain général.
- **Interface générée depuis une configuration** (`config.js`) : ajouter un instrument tient
  en une ligne. Les événements passent par un seul écouteur qui lit `data-action`.
- **Accessibilité** : vrais `<button>` avec libellés, `aria-pressed` sur les bascules, focus
  visible au clavier, sliders nommés.
- **Robustesse** : écran d'erreur avec bouton « Réessayer », qui ne recharge que les pistes
  en échec.

## Lancer en local

Les pistes sont chargées avec `fetch`, la page doit donc être servie par un serveur HTTP
(ouvrir `index.html` directement depuis le disque ne fonctionne pas). Depuis la racine du
dépôt :

```bash
python -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Tests

Tests de bout en bout avec [Playwright](https://playwright.dev) (`tests/app.spec.js`) : la
page charge les 7 pistes, Play démarre et la position avance, un changement de niveau
garde la lecture, Solo et Mute coupent les bonnes pistes, la boucle A-B garde la position
entre A et B, et le bouton de partition télécharge le bon PDF. Ils tournent à chaque push
et pull request avec GitHub Actions. Pour les lancer en local (Node.js et Python
nécessaires) :

```bash
npm install
npx playwright install chromium
npm test
```

Pour utiliser le Chrome déjà installé sur la machine plutôt que de télécharger Chromium,
sautez la deuxième commande et lancez `PW_CHROME=1 npm test`.

## Utilisation

Pour chaque piste :

- **Solo** : n'écouter que les pistes en solo (plusieurs possibles).
- **Mute** : couper la piste. Bouger son slider la réactive.
- **Niveau** (1, 2, 3) : passer au niveau suivant ; le son change sans interrompre la lecture.
- **Télécharger** : partition PDF de l'instrument et du niveau en cours.
- **Lecture** de la piste : lance la lecture avec cette piste en solo.
- Pistes 5 et 6 : le choix de l'instrument se fait en cliquant sur son icône.

Colonne « général » : lecture / pause, stop (remet aussi solos et mutes à zéro) et volume
général.

Barre de temps, au-dessus des pistes : faites-la glisser ou cliquez dessus pour vous
déplacer. **A** place le début de la boucle à la position actuelle, **B** sa fin et lance
la boucle ; **Boucle** l'active ou la désactive et **✕** l'efface.

Tout est utilisable au clavier (Tab, Entrée / Espace, flèches pour les sliders).

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page et écran de chargement. |
| `config.js` | **Liste des pistes et instruments**, chemins des fichiers, noms affichés. |
| `audioLogic.js` | Moteur audio (Web Audio API) : chargement et cache, lecture synchronisée, solo / mute / volume, niveaux, instruments, partitions. |
| `main.js` | Construction de l'interface à partir de `config.js` et gestion des clics. |
| `styles.css` | Mise en forme. |

### Convention de nommage des fichiers

Pour un instrument `<instrument>` (nom utilisé dans `config.js`, ex. `altoSax`) et un
niveau `N` :

```
tracks/lvlN/<instrument>_lvlN.mp3     piste audio
scores/<instrument>/lvlN.pdf          partition
images/Instruments/<instrument>.png   icône
```

La piste « prod » utilise un fichier fixe : `tracks/Infini_prod.mp3`.

Toutes les pistes audio doivent avoir la même durée et commencer au même instant : elles
sont lues ensemble, et un changement de niveau reprend à la même position.

## Ajouter ou modifier un instrument

1. Déposer les fichiers en respectant la convention ci-dessus (un MP3 et un PDF par niveau,
   une icône PNG).
2. Dans `config.js` :
   - ajouter le nom de l'instrument dans le tableau `instruments` d'une piste existante
     (il apparaît alors dans le sélecteur de cette piste), ou ajouter une nouvelle ligne
     dans `TRACKS` pour une nouvelle colonne ;
   - ajouter son nom affiché dans `INSTRUMENT_LABELS`.

Rien d'autre à modifier : l'interface est générée à partir de la configuration.

## Points d'attention

- **Mémoire** : chaque piste est décodée en entier (environ 90 Mo de mémoire pour 4 minutes
  de stéréo). Avec 7 pistes plus le cache des niveaux récemment écoutés, la page peut
  utiliser 600 à 800 Mo, ce qui peut poser problème sur un téléphone ou une petite tablette.
- **Taille du dépôt** : les fichiers audio sont versionnés directement dans Git. Éviter
  d'ajouter des WAV : l'historique contient déjà d'anciens WAV supprimés qui pèsent près
  d'1 Go et alourdissent chaque clone.
