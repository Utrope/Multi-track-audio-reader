let audioContext;
let currentTrackTime = 0;
let startTime = 0; 
let tracks = [];

const trackSources = ['./MashupCutBass.m4a', './MashupCutDrums.m4a', './MashupCutGuitar.m4a',
'./MashupCutOther.m4a', './MashupCutPiano.m4a', './MashupCutVocals.m4a'];
let isPlaying = false;

async function loadTrack(trackPath) {
    const response = await fetch(trackPath);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

function toggleMute(trackIndex) {
    const track = tracks[trackIndex];
    track.gainNode.gain.value = track.isMuted ? 1 : 0;
    track.isMuted = !track.isMuted;
}

async function togglePlayPause() {
    if (!audioContext || audioContext.state == 'closed') {
        await loadAllTracks(trackSources); 
    }
    if (!isPlaying) {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
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
    } else {
        currentTrackTime = audioContext.currentTime - startTime;
        tracks.forEach(track => {
            if (track.source) {
                track.source.stop();
                track.source = null;
            }
        });
        isPlaying = false;
    }
}

async function loadAllTracks(trackSources) {
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const bufferPromises = trackSources.map(trackPath => loadTrack(trackPath));
    const buffers = await Promise.all(bufferPromises);
    tracks = buffers.map(buffer => {
        let gainNode = audioContext.createGain(); // Create a new gain node for each track
        return { buffer: buffer, gainNode: gainNode, isMuted: false };
    });
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

async function initializeAndPlayTracks() {
    if (tracks.length === 0) {
        await loadAllTracks(trackSources);
    }
    await togglePlayPause();
}

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


