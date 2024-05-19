let audioContext;
let currentTrackTime = 0;
let startTime = 0; 
let tracks = [];

const trackSources = ['./MashupCutBass.m4a', './MashupCutDrums.m4a', './MashupCutGuitar.m4a',
'./MashupCutOther.m4a', './MashupCutPiano.m4a', './MashupCutVocals.m4a'];
let isPlaying = false;

// Load a single track and return the decoded audio buffer
async function loadTrack(trackPath) {
    try {
    const response = await fetch(trackPath);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error('Failed to load track: ${trackPath}', error);
        throw error;
    }
}

// Toggle mute/unmute for a specific track
function toggleMute(trackIndex) {
    const track = tracks[trackIndex];
    track.gainNode.gain.value = track.isMuted ? 1 : 0;
    track.isMuted = !track.isMuted;
}

// Toggle play/pause for all tracks
async function togglePlayPause() {
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
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
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
    return { buffer, gainNode, isMuted: false, source: null};
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
        }
        track.source.start(0, currentTrackTime);
    });
    startTime = audioContext.currentTime - currentTrackTime;
    isPlaying = true;
}

// Pause all tracks and store the current playback time
function pauseAllTracks() {
    currentTrackTime = audioContext.currentTime - startTime;
    tracks.forEach(track => {
        if (track.source) {
            track.source.stop();
            track.source = null;
        }
    });
    isPlaying = false;
}

// Handle track end event
function handleTrackEnd() {
	stopTracks();
}

// Initialize and start playing tracks
async function initializeAndPlayTracks() {
    await togglePlayPause();
}

// Stop all tracks and reset the audio context
async function stopTracks() {
    if (audioContext) {
        tracks.forEach(track => {
            if (track.source) {
                track.source.stop();
                track.source = null;
            }
        });
        await audioContext.close();
        audioContext = null;
        tracks = [];
        isPlaying = false;
        currentTrackTime = 0;
    }
}


