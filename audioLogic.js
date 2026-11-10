import { TRACKS, INITIAL_LEVEL, hasLevels, trackPath, scorePath, levelImage } from './config.js';

let audioContext;
let masterGain;
let currentTrackTime = 0;
let startTime = 0;
let tracks = [];

let isPlaying = false;

const MAX_VOLUME = 1.0;
const MIN_VOLUME = 0.0;

// Marge (s) pour programmer un démarrage synchronisé de plusieurs sources.
const START_DELAY = 0.05;

// Variante (instrument + niveau) réellement chargée pour chaque piste.
const currentLevels = TRACKS.map(() => INITIAL_LEVEL);
const currentInstruments = TRACKS.map(track => track.instruments[0]);

// Variante demandée en dernier (peut être en cours de chargement) pour chaque piste.
const pendingLevels = [...currentLevels];
const pendingInstruments = [...currentInstruments];
const loadTokens = TRACKS.map(() => 0);

// Téléphones, tablettes et appareils peu dotés en mémoire : les 7 pistes décodées pèsent
// ~630 Mo à 48 kHz, assez pour faire planter l'onglet. On les décode alors à 32 kHz
// (~420 Mo, bande passante jusqu'à 16 kHz, suffisante pour s'entraîner) et sans cache
// de variantes supplémentaires.
const LOW_MEMORY_DEVICE =
    (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4) ||
    window.matchMedia('(pointer: coarse)').matches;
const LOW_MEMORY_SAMPLE_RATE = 32000;

export async function initAudioContext() {
    if (!audioContext || audioContext.state == 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        try {
            audioContext = LOW_MEMORY_DEVICE
                ? new AudioContextClass({ sampleRate: LOW_MEMORY_SAMPLE_RATE })
                : new AudioContextClass();
        } catch (error) {
            // Fréquence refusée par le navigateur : on garde celle par défaut.
            audioContext = new AudioContextClass();
        }
        // Volume général : toutes les pistes passent par ce nœud avant la sortie.
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
    }

    // iOS coupe le Web Audio quand le téléphone est en mode silencieux, sauf si la page
    // se déclare comme lecteur (Safari 16.4+).
    if (navigator.audioSession)
        navigator.audioSession.type = 'playback';
}

// Télécharge le fichier en signalant l'avancement (octets reçus, taille totale si connue).
async function fetchWithProgress(trackPath, onProgress) {
    const response = await fetch(trackPath);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);

    const total = Number(response.headers.get('Content-Length')) || 0;
    if (!onProgress || !response.body)
        return response.arrayBuffer();

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    onProgress(0, total);
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
        received += value.length;
        onProgress(received, total);
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes.buffer;
}

async function loadTrack(trackPath, onProgress) {
    try {
        const arrayBuffer = await fetchWithProgress(trackPath, onProgress);
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error(`Failed to load track: ${trackPath}`, error);
        throw error;
    }
}

// Cache LRU des pistes décodées (chemin -> Promise<AudioBuffer>). Stocker la promesse
// permet aussi de partager un chargement déjà en cours. Une piste décodée pèse ~90 Mo :
// on garde les pistes en cours d'utilisation plus quelques variantes récentes seulement.
const EXTRA_CACHED_BUFFERS = LOW_MEMORY_DEVICE ? 0 : 2;
const MAX_CACHED_BUFFERS = TRACKS.length + EXTRA_CACHED_BUFFERS;
const bufferCache = new Map();

function getBuffer(trackPath, onProgress) {
    let promise = bufferCache.get(trackPath);
    if (promise) {
        bufferCache.delete(trackPath); // réinséré en fin de Map = le plus récent
    } else {
        promise = loadTrack(trackPath, onProgress).catch(error => {
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

// Charge les pistes de départ. `onProgress({ receivedBytes, totalBytes, decodedTracks,
// totalTracks })` est appelé au fil du téléchargement et du décodage.
// Rejette si une piste ne peut pas être chargée : à l'appelant d'afficher l'erreur.
export async function preloadAllTracks(onProgress = () => {}) {
    await initAudioContext();

    const trackSources = TRACKS.map((_, index) =>
        trackPath(index, currentInstruments[index], currentLevels[index]));

    // Avancement par piste ; une piste déjà en cache (nouvel essai) compte comme terminée.
    const received = trackSources.map(() => 0);
    const sizes = trackSources.map(() => 0);
    let decodedTracks = 0;
    const report = () => onProgress({
        receivedBytes: received.reduce((a, b) => a + b, 0),
        totalBytes: sizes.every(size => size > 0) ? sizes.reduce((a, b) => a + b, 0) : 0,
        decodedTracks,
        totalTracks: trackSources.length,
    });
    report();

    const bufferPromises = trackSources.map(async (path, index) => {
        const buffer = await getBuffer(path, (bytes, total) => {
            received[index] = bytes;
            sizes[index] = total;
            report();
        });
        decodedTracks++;
        if (!sizes[index]) {
            // Taille inconnue ou piste venue du cache : on la compte comme complète.
            sizes[index] = received[index] = 1;
        }
        report();
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

    setButtonState(`muteButton-${trackIndex}`,
        track.isMuted ? "images/Mute/mute_neg.png" : "images/Mute/mute.png", track.isMuted);
    setButtonState(`soloButton-${trackIndex}`,
        track.isSolo ? "images/Solo/Solo_neg.png" : "images/Solo/Solo.png", track.isSolo);

    const slider = document.getElementById(`volume-slider-${trackIndex}`);
    if (slider) {
        slider.value = Math.round(track.volume * 100);
        slider.classList.toggle('silenced', !isAudible(track));
    }
}

// Met à jour l'image d'un bouton et, pour un bouton à bascule, son état aria-pressed.
function setButtonState(buttonId, imageSrc, pressed) {
    const button = document.getElementById(buttonId);
    if (!button)
        return;

    button.querySelector('img').src = imageSrc;
    if (pressed !== undefined)
        button.setAttribute('aria-pressed', String(pressed));
}

function applyAllGains() {
    tracks.forEach((_, index) => applyGain(index));
    updatePlayPauseButtons();
}

// L'icône reste la même (la version contour est quasi invisible sur le fond sombre) :
// l'état « en lecture » passe par aria-pressed, que le CSS signale par un halo.
function updatePlayPauseButtons() {
    const image = "images/PlayPause/Play_pause_neg.png";

    setButtonState('playPauseButton', image, isPlaying);

    tracks.forEach((track, index) => {
        setButtonState(`playPauseButton-${index}`, image, isPlaying && track.isSolo);
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

export async function toggleLocalTrackPlayPause(trackIndex)
{
    const track = tracks[trackIndex];
    const shouldToggle = !isPlaying || track.isSolo;

    if (!track.isSolo)
        toggleSolo(trackIndex);

    if (shouldToggle)
        await togglePlayPause();
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
        const buffer = await getBuffer(trackPath(trackIndex, instrument, level));
        if (token !== loadTokens[trackIndex])
            return false;

        replaceTrackBuffer(trackIndex, buffer);
        currentLevels[trackIndex] = level;
        currentInstruments[trackIndex] = instrument;
    } catch (error) {
        if (token !== loadTokens[trackIndex])
            return false;

        // Échec : on revient à la variante réellement chargée.
        pendingLevels[trackIndex] = currentLevels[trackIndex];
        pendingInstruments[trackIndex] = currentInstruments[trackIndex];
        return false;
    }

    setButtonState(`levelButton-${trackIndex}`, levelImage(level));
    const levelButton = document.getElementById(`levelButton-${trackIndex}`);
    if (levelButton)
        levelButton.setAttribute('aria-label', `Niveau ${level} sur ${TRACKS[trackIndex].levels}, changer de niveau`);

    document.querySelectorAll(`#track-${trackIndex} [data-instrument]`).forEach(button => {
        const isActive = button.dataset.instrument === instrument;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    return true;
}

export async function switchTrackLevel(trackIndex) {
    if (!hasLevels(trackIndex))
        return false;

    pendingLevels[trackIndex] = pendingLevels[trackIndex] % TRACKS[trackIndex].levels + 1;
    return loadTrackVariant(trackIndex);
}

// Télécharge la partition de l'instrument et du niveau actuellement chargés.
export async function downloadPDF(trackIndex) {
    if (!hasLevels(trackIndex))
        return;

    const instrumentName = currentInstruments[trackIndex];
    const level = currentLevels[trackIndex];
    const pdfPath = scorePath(instrumentName, level);
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