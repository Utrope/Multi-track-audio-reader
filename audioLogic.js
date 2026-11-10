let audioContext;
let masterGain;
let currentTrackTime = 0;
let startTime = 0; 
let tracks = [];

const trackSources = [
    './tracks/lvl1/drums_lvl1.mp3',
    './tracks/lvl1/bass_lvl1.mp3',
    './tracks/lvl1/guitar_lvl1.mp3',
    './tracks/lvl1/keyboard_lvl1.mp3',
    './tracks/lvl1/altoSax_lvl1.mp3',
    './tracks/lvl1/trombone_lvl1.mp3',
    './tracks/Infini_prod.mp3',
];

const trackNames = [
    'drums.png',
    'bass.png',
    'guitar.png',
    'keyboard.png',
    'altoSax.png',
    'trombone.png',
    'prod.png'
];

const instrumentSources = {
    altoSax: './tracks/lvl1/altoSax_lvl1.mp3',
    flute: './tracks/lvl1/flute_lvl1.mp3',
    trombone: './tracks/lvl1/trombone_lvl1.mp3',
    tenor: './tracks/lvl1/tenor_lvl1.mp3'
};

let isPlaying = false;

const MAX_VOLUME = 1.0;
const MIN_VOLUME = 0.0;

// Marge (s) pour programmer un démarrage synchronisé de plusieurs sources.
const START_DELAY = 0.05;

const maxLevels = [
    3,
    3,
    3,
    3,
    3,
    3,
    4
];

export const initialLevels = [
    1,
    1,
    1,
    1,
    1,
    1,
    4
]

const currentLevels = [...initialLevels];

// Variante demandée en dernier (peut être en cours de chargement) pour chaque piste.
const pendingLevels = [...initialLevels];
const pendingInstruments = trackNames.map(name => name.split('.')[0]);
const loadTokens = trackNames.map(() => 0);

export async function initAudioContext() {
    if (!audioContext || audioContext.state == 'closed') {
        audioContext =  new (window.AudioContext || window.webkitAudioContext)();
        // Volume général : toutes les pistes passent par ce nœud avant la sortie.
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
    }
}

async function loadTrack(trackPath) {
    try {
    const response = await fetch(trackPath);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error(`Failed to load track: ${trackPath}`, error);
        throw error;
    }
}

// Cache LRU des pistes décodées (chemin -> Promise<AudioBuffer>). Stocker la promesse
// permet aussi de partager un chargement déjà en cours. Une piste décodée pèse ~90 Mo :
// on garde les pistes en cours d'utilisation plus quelques variantes récentes seulement.
const EXTRA_CACHED_BUFFERS = 2;
const MAX_CACHED_BUFFERS = trackSources.length + EXTRA_CACHED_BUFFERS;
const bufferCache = new Map();

function getBuffer(trackPath) {
    let promise = bufferCache.get(trackPath);
    if (promise) {
        bufferCache.delete(trackPath); // réinséré en fin de Map = le plus récent
    } else {
        promise = loadTrack(trackPath).catch(error => {
            // Un échec n'est pas mis en cache : le prochain essai refera la requête.
            if (bufferCache.get(trackPath) === promise)
                bufferCache.delete(trackPath);
            throw error;
        });
    }
    bufferCache.set(trackPath, promise);

    while (bufferCache.size > MAX_CACHED_BUFFERS)
        bufferCache.delete(bufferCache.keys().next().value);

    return promise;
}

// Rejette si une piste ne peut pas être chargée : à l'appelant d'afficher l'erreur.
export async function preloadAllTracks(trackSources) {
    await initAudioContext();

    const totalTracks = trackSources.length+1;
    let loadedTracks = 1;

    const updateProgress = () => {
        loadedTracks++;
        const progress = (loadedTracks / totalTracks) * 100;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }
    document.getElementById('progress-bar').style.width = `${(loadedTracks / totalTracks) * 100}%`;

    const bufferPromises = trackSources.map(async (trackPath) => {
        const buffer = await getBuffer(trackPath);
        updateProgress();
        return buffer;
    });

    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => createTrack(buffer));
}

// Seul endroit qui décide du gain réel d'une piste, à partir de son volume, de son mute
// et des solos actifs. Met aussi à jour les boutons Mute/Solo et l'aspect du slider.
function isAudible(track) {
    const anySolo = tracks.some(t => t.isSolo);
    return !track.isMuted && (!anySolo || track.isSolo);
}

function applyGain(trackIndex) {
    const track = tracks[trackIndex];
    track.gainNode.gain.value = isAudible(track) ? track.volume : 0;

    const muteButton = document.getElementById(`muteButton-${trackIndex}`);
    if (muteButton)
        muteButton.src = track.isMuted ? "images/Mute/mute_neg.png" : "images/Mute/mute.png";

    const soloButton = document.getElementById(`soloButton-${trackIndex}`);
    if (soloButton)
        soloButton.src = track.isSolo ? "images/Solo/Solo_neg.png" : "images/Solo/Solo.png";

    const slider = document.getElementById(`volume-slider-${trackIndex}`);
    if (slider) {
        slider.value = Math.round(track.volume * 100);
        slider.classList.toggle('silenced', !isAudible(track));
    }
}

function applyAllGains() {
    tracks.forEach((_, index) => applyGain(index));
    updatePlayPauseButtons();
}

function updatePlayPauseButtons() {
    const playingImage = "images/PlayPause/Play pause.png";
    const idleImage = "images/PlayPause/Play_pause_neg.png";

    const generalButton = document.getElementById('playPauseButton');
    if (generalButton)
        generalButton.src = isPlaying ? playingImage : idleImage;

    tracks.forEach((track, index) => {
        const button = document.getElementById(`playPauseButton-${index}`);
        if (button)
            button.src = isPlaying && track.isSolo ? playingImage : idleImage;
    });
}

export function toggleMute(trackIndex) {
    const track = tracks[trackIndex];
    track.isMuted = !track.isMuted;
    applyGain(trackIndex);
}

export function setVolume(trackIndex, volume) {
    const track = tracks[trackIndex];
    track.volume = Math.min(Math.max(volume / 100, MIN_VOLUME), MAX_VOLUME);

    // Toucher au slider d'une piste mutée la réactive.
    if (track.isMuted && track.volume > 0)
        track.isMuted = false;

    applyGain(trackIndex);
}

export function setMasterVolume(volume) {
    masterGain.gain.value = Math.min(Math.max(volume / 100, MIN_VOLUME), MAX_VOLUME);
}

export async function togglePlayPause() {
    if (!isPlaying) {
        await resumeAudioContext();
        startAllTracks();
    } else {
        pauseAllTracks();
    }
}

async function resumeAudioContext() {
    if (audioContext.state == 'suspended') {
        await audioContext.resume();
    }
}

function createTrack(buffer) {
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(masterGain);
    return { buffer, gainNode, source: null, retiringSource: null, volume: 1.0, isMuted: false, isSolo: false };
}

function createSource(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
	source.onended = handleTrackEnd;
    return source;
}

function startAllTracks() {
    // Toutes les sources sont programmées sur le même instant pour rester synchronisées.
    const when = audioContext.currentTime + START_DELAY;
    tracks.forEach(track => {
        if (!track.source) {
            track.source = createSource(track.buffer);
            track.source.connect(track.gainNode);
            track.source.start(when, currentTrackTime);
        }
    });
    startTime = when - currentTrackTime;
    isPlaying = true;
    updatePlayPauseButtons();
}

async function pauseAllTracks() {
    currentTrackTime = audioContext.currentTime - startTime;
    isPlaying = false;
    updatePlayPauseButtons();
    await audioContext.suspend();
}

function handleTrackEnd() {
	stopTracks();
}

export async function stopTracks() {
    if (audioContext) {
        // Stop remet aussi à zéro les solos et les mutes (les volumes sont conservés).
        tracks.forEach(track => {
            if (track.source) {
                disposeSource(track.source);
                track.source = null;
            }
            if (track.retiringSource) {
                disposeSource(track.retiringSource);
                track.retiringSource = null;
            }
            track.isSolo = false;
            track.isMuted = false;
        });
        isPlaying = false;
        currentTrackTime = 0;
        applyAllGains();
    }
}

export function toggleSolo(trackIndex) {
    const track = tracks[trackIndex];
    track.isSolo = !track.isSolo;
    applyAllGains();
}

export function toggleLocalTrackPlayPause(trackIndex)
{
    const track = tracks[trackIndex];

    if (!isPlaying || track.isSolo)
        togglePlayPause();

    if (!track.isSolo)
        toggleSolo(trackIndex);
}

// Arrête définitivement une source : sans onended, elle ne peut plus déclencher stopTracks().
function disposeSource(source) {
    source.onended = null;
    try {
        source.stop();
    } catch (error) {
        // Source jamais démarrée : rien à arrêter.
    }
    source.disconnect();
}

// Remplace le buffer d'une piste, qu'elle soit en lecture, en pause ou à l'arrêt.
function replaceTrackBuffer(trackIndex, buffer) {
    const track = tracks[trackIndex];
    track.buffer = buffer;

    if (!track.source)
        return;

    // Bascule au même instant exact : l'ancienne source s'arrête quand la nouvelle démarre,
    // à la même position que les autres pistes.
    const when = audioContext.currentTime + START_DELAY;
    if (track.retiringSource)
        disposeSource(track.retiringSource);
    const oldSource = track.source;
    oldSource.onended = null;
    oldSource.stop(when);
    // Gardée pour que Stop puisse la couper avant son arrêt programmé (ex. si en pause).
    track.retiringSource = oldSource;

    track.source = createSource(buffer);
    track.source.connect(track.gainNode);
    if (when >= startTime)
        track.source.start(when, when - startTime);
    else
        track.source.start(startTime, 0); // lecture programmée mais pas encore commencée
}

// Charge la variante (instrument + niveau) demandée en dernier pour une piste.
// Un jeton par piste permet d'ignorer les réponses arrivées après une requête plus récente.
async function loadTrackVariant(trackIndex) {
    const token = ++loadTokens[trackIndex];
    const level = pendingLevels[trackIndex];
    const instrument = pendingInstruments[trackIndex];

    try {
        const buffer = await getBuffer(`./tracks/lvl${level}/${instrument}_lvl${level}.mp3`);
        if (token !== loadTokens[trackIndex])
            return false;

        replaceTrackBuffer(trackIndex, buffer);
        currentLevels[trackIndex] = level;
        trackNames[trackIndex] = `${instrument}.png`;
    } catch (error) {
        if (token !== loadTokens[trackIndex])
            return false;

        // Échec : on revient à la variante réellement chargée.
        pendingLevels[trackIndex] = currentLevels[trackIndex];
        pendingInstruments[trackIndex] = trackNames[trackIndex].split('.')[0];
        return false;
    }

    const levelButtonImage = document.getElementById(`levelButton-${trackIndex}`);
    const downloadButton = document.getElementById(`downloadButton-${trackIndex}`);
    if (levelButtonImage)
        levelButtonImage.src = `./images/Levels/lvl${level}.png`;
    if (downloadButton)
        downloadButton.onclick = () => downloadPDF(trackIndex, currentLevels[trackIndex]);

    return true;
}

export async function switchTrackLevel(trackIndex) {
    if (!trackSources[trackIndex].includes('lvl'))
        return false;

    pendingLevels[trackIndex] = pendingLevels[trackIndex] % maxLevels[trackIndex] + 1;
    return loadTrackVariant(trackIndex);
}

export async function downloadPDF(i, level) {
    const instrumentName = trackNames[i].split('.')[0];
    const pdfPath = `scores/${instrumentName}/lvl${level}.pdf`;
    try {
        // Simple vérification d'existence, pour ne pas télécharger une page 404.
        const response = await fetch(pdfPath, { method: 'HEAD' });
        if (!response.ok) {
            throw new Error (`PDF not found for ${instrumentName} at level ${level}`);
        }

        // Lien direct : le navigateur gère le téléchargement, sans blob à révoquer.
        const a = document.createElement('a');
        a.href = pdfPath;
        a.download = `${instrumentName}_lvl${level}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        console.error(`Error downloading PDF: ${error.message}`);
    }
}

export async function switchInstrument(trackIndex, newInstrument) {
    if (pendingInstruments[trackIndex] === newInstrument)
        return false;

    pendingInstruments[trackIndex] = newInstrument;
    return loadTrackVariant(trackIndex);
}

function handleErrors(fn) {
    return function(...params) {
        return fn(...params).catch(error => {
            console.error('An error occurred:', error);
        });
    }
}

togglePlayPause = handleErrors(togglePlayPause);
stopTracks = handleErrors(stopTracks);