// Configuration des pistes, dans l'ordre d'affichage. C'est le seul endroit à modifier
// pour ajouter, retirer ou réordonner une piste ou un instrument.
//
// - instruments : noms des instruments de la piste. Le premier est actif au démarrage ;
//   s'il y en a plusieurs, un sélecteur d'instrument est affiché.
// - levels : nombre de niveaux. Chaque instrument doit alors avoir
//   tracks/lvlN/<instrument>_lvlN.mp3 et scores/<instrument>/lvlN.pdf pour N = 1..levels.
// - source : fichier audio fixe, pour une piste sans niveaux ni partition (pas de `levels`).
//
// L'icône de chaque instrument est images/Instruments/<instrument>.png.
export const TRACKS = [
    { instruments: ['drums'], levels: 3 },
    { instruments: ['bass'], levels: 3 },
    { instruments: ['guitar'], levels: 3 },
    { instruments: ['keyboard'], levels: 3 },
    { instruments: ['altoSax', 'flute'], levels: 3 },
    { instruments: ['trombone', 'tenorSax'], levels: 3 },
    { instruments: ['prod'], source: './tracks/Infini_prod.mp3' },
];

export const INITIAL_LEVEL = 1;

export function hasLevels(trackIndex) {
    return Boolean(TRACKS[trackIndex].levels);
}

export function trackPath(trackIndex, instrument, level) {
    const track = TRACKS[trackIndex];
    if (!track.levels)
        return track.source;
    return `./tracks/lvl${level}/${instrument}_lvl${level}.mp3`;
}

export function scorePath(instrument, level) {
    return `scores/${instrument}/lvl${level}.pdf`;
}

export function instrumentImage(instrument) {
    return `images/Instruments/${instrument}.png`;
}

export function levelImage(level) {
    return `images/Levels/lvl${level}.png`;
}
