let audioContext;
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

const VOLUME_STEP = 0.1;
const MAX_VOLUME = 1.0;
const MIN_VOLUME = 0.0;

let isTracksLoaded = false;
let originalMuteStates = [];

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

export async function preloadAllTracks(trackSources) {
    await initAudioContext();

    const totalTracks = trackSources.length+1;
    let loadedTracks = 1;

    const updateProgress = () => {
        loadedTracks++;
        const progress = (loadedTracks / totalTracks) * 100;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }

    const bufferPromises = trackSources.map(async (trackPath) => {
        const buffer = await loadTrack(trackPath);
        updateProgress();
        return buffer;
    });
    
    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => createTrack(buffer));
    isTracksLoaded = true;
}

export function toggleMute(trackIndex) {
    const track = tracks[trackIndex];
    const muteButton = document.getElementById(`muteButton-${trackIndex}`);

    const muteEnabledImage = "images/Mute/mute_neg.png";
    const muteDisabledImage = "images/Mute/mute.png";
    
    track.isMuted = !track.isMuted;
    muteButton.src = track.isMuted ? muteEnabledImage : muteDisabledImage;
    document.getElementById(`volume-slider-${trackIndex}`).value = track.isMuted ? 0 : track.previousVolume * 100;

    if (track.isSolo)
    {
        originalMuteStates[trackIndex] = track.isMuted;
        return;
    }
    
    track.gainNode.gain.value = track.isMuted ? 0 : track.previousVolume; 
}

export function setVolume(trackIndex, volume) {
    const track = tracks[trackIndex];
    track.previousVolume = Math.min(Math.max(volume / 100, MIN_VOLUME), MAX_VOLUME);
    
    if (track.isMuted && volume > 0) {
        track.isMuted = false;
    }
    track.gainNode.gain.value = track.isMuted ? 0 : track.previousVolume;
}

export function setAllVolumes(volume) {
    tracks.forEach(track => {
        track.gainNode.gain.value = Math.min(Math.max(volume / 100, MIN_VOLUME), MAX_VOLUME);
}
)};

export async function togglePlayPause() {
    if (!audioContext || audioContext.state == 'closed') {
        await loadAllTracks(trackSources); 
    }
    
    if (!isPlaying) {
        await resumeAudioContext();
        startAllTracks();
    } else {
        pauseAllTracks();
    }
}

async function loadAllTracks(trackSources) {
    await initAudioContext();
    const bufferPromises = trackSources.map(trackPath => loadTrack(trackPath));
    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => createTrack(buffer));
}

async function resumeAudioContext() {
    if (audioContext.state == 'suspended') {
        await audioContext.resume();
    }
}

function createTrack(buffer) {
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // Set initial volume to max
    return { buffer, gainNode, isMuted: false, source: null, previousVolume: 1.0};
}

function createSource(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
	source.onended = handleTrackEnd;
    return source;
}

function startAllTracks() {
    tracks.forEach(track => {
        if (!track.source) {
            track.source = createSource(track.buffer);
            track.source.connect(track.gainNode);
            track.gainNode.connect(audioContext.destination);
            track.source.start(0, currentTrackTime);
        }
    });
    startTime = audioContext.currentTime - currentTrackTime;
    isPlaying = true;
}

async function pauseAllTracks() {
    currentTrackTime = audioContext.currentTime - startTime;
    await audioContext.suspend();
    isPlaying = false;
}

function handleTrackEnd() {
	stopTracks();
}

async function initializeAndPlayTracks() {
    if (!isTracksLoaded) {
        await preloadAllTracks(trackSources);
    }
    await togglePlayPause();
}

export async function stopTracks() {
    if (audioContext) {
        tracks.forEach((track, index) => {
            if (track.source) {
                disposeSource(track.source);
                track.source = null;
                if (track.isSolo)
                    toggleSolo(index);
                if (track.isMuted)
                    toggleMute(index);
            }
        });
        isPlaying = false;
        currentTrackTime = 0;
    }
}

export function increaseAllVolumes() {
    tracks.forEach((track, index) => {
        setVolume(index, track.gainNode.gain.value + VOLUME_STEP);
    });
}

export function decreaseAllVolumes() {
    tracks.forEach((track, index) => {
        setVolume(index, track.gainNode.gain.value - VOLUME_STEP);
    });
}

export function toggleSolo(trackIndex) {
    const track = tracks[trackIndex];
    const soloButton = document.getElementById(`soloButton-${trackIndex}`);

    track.isSolo = !track.isSolo;

    const soloEnabledImage = "images/Solo/Solo_neg.png";
    const soloDisabledImage = "images/Solo/Solo.png";
    soloButton.src = track.isSolo ? soloEnabledImage : soloDisabledImage;  
    applyStrongMute();
}

function applyStrongMute() {
    const soloedTracks = tracks.filter(track => track.isSolo);

    if (soloedTracks.length > 0) {
        tracks.forEach((track, index) => {
            if (originalMuteStates[index] == undefined) {
                originalMuteStates[index] = track.isMuted;
            }

            if (track.isSolo) {
                    track.gainNode.gain.value = track.previousVolume;
                    document.getElementById(`volume-slider-${index}`).value = track.previousVolume * 100;
            } else {
                track.gainNode.gain.value = 0;
                document.getElementById(`volume-slider-${index}`).value = 0;
            }
        });
    } else {
        tracks.forEach((track, index) => {
            track.isMuted = originalMuteStates[index];
            track.gainNode.gain.value = track.isMuted ? 0 : track.previousVolume;
            document.getElementById(`volume-slider-${index}`).value = track.isMuted ? 0 : track.previousVolume * 100;
        });
        originalMuteStates = [];
    }
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

    const currentPlaybackTime = audioContext.currentTime - startTime;
    disposeSource(track.source);

    track.source = createSource(buffer);
    track.source.connect(track.gainNode);
    track.gainNode.connect(audioContext.destination);
    track.source.start(0, currentPlaybackTime);
}

// Charge la variante (instrument + niveau) demandée en dernier pour une piste.
// Un jeton par piste permet d'ignorer les réponses arrivées après une requête plus récente.
async function loadTrackVariant(trackIndex) {
    const token = ++loadTokens[trackIndex];
    const level = pendingLevels[trackIndex];
    const instrument = pendingInstruments[trackIndex];

    try {
        const buffer = await loadTrack(`./tracks/lvl${level}/${instrument}_lvl${level}.mp3`);
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
        const response = await fetch(pdfPath);
        if (!response.ok) {
            throw new Error (`PDF not found for ${instrumentName} at level ${level}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${instrumentName}_lvl${level}.pdf`;
        document.body.appendChild(a);
        a.click();

        URL.revokeObjectURL(url);
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

initializeAndPlayTracks = handleErrors(initializeAndPlayTracks);
togglePlayPause = handleErrors(togglePlayPause);
stopTracks = handleErrors(stopTracks);
preloadAllTracks = handleErrors(preloadAllTracks);