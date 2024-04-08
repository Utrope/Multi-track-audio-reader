const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const tracks = [];
const trackSources = ['./MashupCutBass.m4a', './MashupCutDrums.m4a', './MashupCutGuitar.m4a',
'./MashupCutOther.m4a', './MashupCutPiano.m4a', './MashupCutVocals.m4a'];

async function loadTrack(trackPath) {
	const response = await fetch(trackPath);
	const arrayBuffer = await response.arrayBuffer();
	const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
	const trackSource = audioContext.createBufferSource();
	trackSource.buffer = audioBuffer;

	const gainNode = audioContext.createGain();
	trackSource.connect(gainNode);
	gainNode.connect(audioContext.destination);

	return { source: trackSource, gainNode: gainNode, isMuted: false};
}


function toggleMute(trackIndex) 
{
	const track = tracks[trackIndex];


		if (track.isMuted)
		{
			track.gainNode.gain.value = 1;
			track.isMuted = false;
		}
		else
		{
			track.gainNode.gain.value = 0;
			track.isMuted = true;
		}
}

function playAllTracks()
{
	const startTime = audioContext.currentTime  + 0.1;
	tracks.forEach(track => {
		track.source.start(startTime);
	});
}

async function loadAllTracks(trackSources) {
	const trackPromises = trackSources.map(trackPath => loadTrack(trackPath));
	const loadedTracks = await Promise.all(trackPromises);
	loadedTracks.forEach(track => tracks.push(track));
}

async function initializeAndPlayTracks() {
	await loadAllTracks(trackSources);
	playAllTracks();
}