const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const tracks = [];
const trackSources = ['./vocals.wav', './accompaniment.wav'];

trackSources.forEach((trackPath, index) =>
{
	fetch(trackPath)
	.then(response => response.arrayBuffer())
	.then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
	.then(audioBuffer => 
	{
		const trackSource = audioContext.createBufferSource();
		trackSource.buffer = audioBuffer;

		const gainNode = audioContext.createGain();
		trackSource.connect(gainNode);
		gainNode.connect(audioContext.destination);
		tracks.push({source: trackSource, gainNode: gainNode, isMuted:false});
	});
});

function toggleMute(trackIndex) 
{
	const track = tracks[trackIndex];

	if (track.source.startCalled)
	{
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
}

function playAllTracks()
{
	const startTime = audioContext.currentTime  + 0.1;
	tracks.forEach(track => 
	{
		if (!track.source.startCalled) 
		{
			track.source.start(startTime);
			track.source.startCalled = true;
		}
	});
}