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
let isPlaying = false;

const VOLUME_STEP = 0.1; // Step value for volume increase/decrease
const MAX_VOLUME = 1.0; // Maximum volume level
const MIN_VOLUME = 0.0; // Minimum volume level

let isTracksLoaded = false; // Flag to check if tracks are loaded
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

export async function initAudioContext() {
    if (!audioContext || audioContext.state == 'closed') {
        audioContext =  new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Load a single track and return the decoded audio buffer
async function loadTrack(trackPath) {
    try {
    const response = await fetch(trackPath);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error(`Failed to load track: ${trackPath}`, error);
        throw error;
    }
}

// Preload and decode all tracks on page load
export async function preloadAllTracks(trackSources) {
    await initAudioContext();
    const bufferPromises = trackSources.map(loadTrack);
    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => createTrack(buffer));
    isTracksLoaded = true;
}

// Toggle mute/unmute for a specific track
export function toggleMute(trackIndex) {
    const track = tracks[trackIndex];
    const muteButton = document.getElementById(`muteButton-${trackIndex}`);

    const muteEnabledImage = "images/mute/mute_neg.png";
    const muteDisabledImage = "images/mute/mute.png";
    
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


// Set the volume for a specific track
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


// Toggle play/pause for all tracks
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

// Load and decode all tracks
async function loadAllTracks(trackSources) {
    await initAudioContext();
    const bufferPromises = trackSources.map(trackPath => loadTrack(trackPath));
    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => createTrack(buffer));
}

// Resume the audio context if it is suspended
async function resumeAudioContext() {
    if (audioContext.state == 'suspended') {
        await audioContext.resume();
    }
}

// Create a track object with buffer and gain node
function createTrack(buffer) {
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // Set initial volume to max
    return { buffer, gainNode, isMuted: false, source: null, previousVolume: 1.0};
}

// Create a source node from the buffer and handle the track end
function createSource(buffer) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
	source.onended = handleTrackEnd;
    return source;
}

// Start all tracks from the current time
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

// Pause all tracks and store the current playback time
async function pauseAllTracks() {
    currentTrackTime = audioContext.currentTime - startTime;
    await audioContext.suspend();
    isPlaying = false;
}

// Handle track end event
function handleTrackEnd() {
	stopTracks();
}

// Initialize and start playing tracks
async function initializeAndPlayTracks() {
    if (!isTracksLoaded) {
        await preloadAllTracks(trackSources);
    }
    await togglePlayPause();
}

// Stop all tracks and reset the audio context
export async function stopTracks() {
    if (audioContext) {
        tracks.forEach((track, index) => {
            if (track.source) {
                track.source.stop();
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

// Increase the volume for all tracks
export function increaseAllVolumes() {
    tracks.forEach((track, index) => {
        setVolume(index, track.gainNode.gain.value + VOLUME_STEP);
    });
}

// Decrease the volume for all tracks
export function decreaseAllVolumes() {
    tracks.forEach((track, index) => {
        setVolume(index, track.gainNode.gain.value - VOLUME_STEP);
    });
}

// Toggle solo for a specific track
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

export async function switchTrackLevel(trackIndex) {    
    const originalTrackPath = trackSources[trackIndex];

    if (!originalTrackPath.includes('lvl')) {
        return;
    }

    let nextLevel = currentLevels[trackIndex] + 1;
    if (nextLevel > maxLevels[trackIndex]) {
        nextLevel = 1;
    }

    const levelTrackPath = originalTrackPath.replace(/lvl1/g, `lvl${nextLevel}`);
    const exists = await fileExists(levelTrackPath);

    if (!exists)
        return;

    const levelBuffer = await loadTrack(levelTrackPath);
    const track = tracks[trackIndex];

    if (track.source) 
    {
        const currentPlaybackTime = audioContext.currentTime - startTime;

        track.source.disconnect();
        track.source = null;

        track.buffer = levelBuffer;
        track.source = createSource(track.buffer);

        track.source.connect(track.gainNode);
        track.gainNode.connect(audioContext.destination);

        track.source.start(0, currentPlaybackTime);
    } 

    currentLevels[trackIndex] = nextLevel;

    const levelButtonImage = document.getElementById(`levelButton-${trackIndex}`);
    if (levelButtonImage) {
        levelButtonImage.src = `./images/Levels/lvl${nextLevel}.png`;
    }
}

// Error handler to wrap async functions
function handleErrors(fn) {
    return function(...params) {
        return fn(...params).catch(error => {
            console.error('An error occurred:', error);
        });
    }
}

async function fileExists(url) {
    try{
        const response = await fetch(url, {method: 'HEAD'});
        return response.ok;
    } catch (error) {
        return false;
    }
}

initializeAndPlayTracks = handleErrors(initializeAndPlayTracks);
togglePlayPause = handleErrors(togglePlayPause);
stopTracks = handleErrors(stopTracks);
preloadAllTracks = handleErrors(preloadAllTracks);