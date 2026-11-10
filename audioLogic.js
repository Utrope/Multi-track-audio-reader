import { TRACKS, INITIAL_LEVEL, hasLevels, trackPath, scorePath, levelImage } from './config.js';

let audioContext;
let masterGain;
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

// --- Transport : position, lecture, pause, déplacement, boucle A-B ----------------------
//
// Ancre de lecture : les sources ont démarré (ou démarreront) à l'instant `playOriginTime`
// de l'horloge audio, à la position `playOriginOffset` du morceau. La position courante
// s'en déduit. En pause, le contexte audio est suspendu et son horloge gelée : la position
// calculée reste donc juste sans autre état à tenir.
let playOriginTime = 0;
let playOriginOffset = 0;
// Position de départ quand aucune source n'existe (avant la lecture ou après Stop).
let stoppedPosition = 0;

// Boucle A-B. Elle est appliquée par les sources elles-mêmes (loop / loopStart / loopEnd),
// donc à l'échantillon près et identiquement sur toutes les pistes.
const MIN_LOOP_LENGTH = 0.5;
let loop = { start: null, end: null, enabled: false };

function loopActive() {
    return loop.enabled && loop.start !== null && loop.end !== null && loop.end > loop.start;
}

function hasSources() {
    return tracks.some(track => track.source);
}

// Position du morceau à l'instant `contextTime`. Les sources démarrent toujours à
// l'intérieur de la boucle quand elle est active, donc le repli ci-dessous suffit.
function positionAt(contextTime) {
    let position = playOriginOffset + Math.max(0, contextTime - playOriginTime);
    if (loopActive() && position >= loop.end)
        position = loop.start + ((position - loop.end) % (loop.end - loop.start));
    return position;
}

function currentPosition() {
    return hasSources() ? positionAt(audioContext.currentTime) : stoppedPosition;
}

// Durée jouable : la lecture s'arrête quand la piste la plus courte se termine.
export function getDuration() {
    return tracks.length ? Math.min(...tracks.map(track => track.buffer.duration)) : 0;
}

export function getPlaybackState() {
    const duration = getDuration();
    return {
        position: Math.min(currentPosition(), duration),
        duration,
        isPlaying,
        loop: { start: loop.start, end: loop.end, enabled: loop.enabled, active: loopActive() },
    };
}

function clampIntoLoop(offset) {
    if (loopActive() && (offset < loop.start || offset >= loop.end))
        return loop.start;
    return offset;
}

function startSource(track, when, offset) {
    track.source = createSource(track.buffer);
    track.source.loop = loopActive();
    if (track.source.loop) {
        track.source.loopStart = loop.start;
        track.source.loopEnd = loop.end;
    }
    track.source.connect(track.gainNode);
    track.source.start(when, offset);
}

// Remplace la source d'une piste par une nouvelle qui démarre à `when`, à `offset`.
// En lecture, l'ancienne s'arrête au même instant exact (aucun trou) ; en pause, elle est
// coupée tout de suite pour ne pas rejouer un fragment de l'ancienne position à la reprise.
function swapSource(track, when, offset) {
    if (track.retiringSource) {
        disposeSource(track.retiringSource);
        track.retiringSource = null;
    }

    const oldSource = track.source;
    if (oldSource) {
        if (isPlaying) {
            oldSource.onended = () => {
                oldSource.disconnect();
                if (track.retiringSource === oldSource)
                    track.retiringSource = null;
            };
            oldSource.stop(when);
            track.retiringSource = oldSource;
        } else {
            disposeSource(oldSource);
        }
    }

    startSource(track, when, offset);
}

// (Re)démarre toutes les pistes au même instant, à la position `offset` du morceau.
function restartAllAt(offset) {
    const when = audioContext.currentTime + START_DELAY;
    offset = clampIntoLoop(offset);
    tracks.forEach(track => swapSource(track, when, offset));
    playOriginTime = when;
    playOriginOffset = offset;
}

function disposeAllSources() {
    tracks.forEach(track => {
        if (track.source) {
            disposeSource(track.source);
            track.source = null;
        }
        if (track.retiringSource) {
            disposeSource(track.retiringSource);
            track.retiringSource = null;
        }
    });
}

export async function togglePlayPause() {
    if (!isPlaying) {
        await resumeAudioContext();
        if (!hasSources())
            restartAllAt(stoppedPosition);
        isPlaying = true;
    } else {
        isPlaying = false;
        updatePlayPauseButtons();
        await audioContext.suspend();
    }
    updatePlayPauseButtons();
}

// Se déplace à `position` (en secondes), en lecture, en pause ou à l'arrêt.
export function seek(position) {
    const duration = getDuration();
    position = Math.min(Math.max(0, position), Math.max(0, duration - START_DELAY));

    if (hasSources())
        restartAllAt(position);
    else
        stoppedPosition = clampIntoLoop(position);
}

// Modifie la boucle puis repart de la position courante avec une ancre cohérente.
function updateLoop(change) {
    const playing = hasSources();
    const wasActive = loopActive();
    // Position au moment où les nouvelles sources prendront le relais, avec l'ancienne boucle.
    const position = playing ? positionAt(audioContext.currentTime + START_DELAY) : stoppedPosition;

    change();

    // Boucle inactive avant comme après (ex. on vient seulement de poser A) : les sources en
    // cours restent valables, inutile de les redémarrer.
    if (!wasActive && !loopActive())
        return;

    if (playing)
        restartAllAt(position);
    else
        stoppedPosition = clampIntoLoop(position);
}

// Place le début (A) ou la fin (B) de la boucle à la position courante. Placer B active
// la boucle. Renvoie false si le point est refusé (B avant A, ou boucle trop courte).
export function setLoopPoint(which) {
    const position = getPlaybackState().position;

    if (which === 'start') {
        updateLoop(() => {
            loop.start = position;
            if (loop.end !== null && loop.end < position + MIN_LOOP_LENGTH) {
                loop.end = null;
                loop.enabled = false;
            }
        });
        return true;
    }

    if (loop.start === null || position < loop.start + MIN_LOOP_LENGTH)
        return false;
    updateLoop(() => {
        loop.end = position;
        loop.enabled = true;
    });
    return true;
}

export function toggleLoop() {
    if (loop.start === null || loop.end === null)
        return;
    updateLoop(() => {
        loop.enabled = !loop.enabled;
    });
}

export function clearLoop() {
    updateLoop(() => {
        loop = { start: null, end: null, enabled: false };
    });
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

function handleTrackEnd() {
	stopTracks();
}

export async function stopTracks() {
    if (audioContext) {
        disposeAllSources();
        // Stop remet aussi à zéro les solos et les mutes (les volumes et la boucle sont
        // conservés). On repart du début, ou du début de la boucle si elle est active.
        tracks.forEach(track => {
            track.isSolo = false;
            track.isMuted = false;
        });
        isPlaying = false;
        stoppedPosition = clampIntoLoop(0);
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

    // Bascule au même instant exact, à la même position que les autres pistes. Si la
    // lecture est programmée mais pas encore commencée, on se cale sur son démarrage.
    const when = audioContext.currentTime + START_DELAY;
    if (when < playOriginTime)
        swapSource(track, playOriginTime, playOriginOffset);
    else
        swapSource(track, when, positionAt(when));
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