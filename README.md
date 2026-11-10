# Outil audio multipistes

Lecteur multipiste dans le navigateur pour travailler le morceau *Infini* : chaque instrument
est une piste qu'on peut écouter seule, couper, régler en volume, passer d'un niveau de
difficulté à l'autre, et dont on peut télécharger la partition. Une piste « prod » joue
l'accompagnement complet.

Site statique (HTML, CSS, JavaScript sans dépendance ni étape de build), publié avec
GitHub Pages.

## Lancer en local

Les pistes sont chargées avec `fetch`, la page doit donc être servie par un serveur HTTP
(ouvrir `index.html` directement depuis le disque ne fonctionne pas). Depuis la racine du
dépôt :

```bash
python -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

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
