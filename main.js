import { initAudioContext, preloadAllTracks, togglePlayPause, stopTracks, setAllVolumes, toggleMute, setVolume } from './audioLogic.js';

const trackSources = [
    './MashupCutBass.m4a',
    './MashupCutDrums.m4a',
    './MashupCutGuitar.m4a',
    './MashupCutOther.m4a',
    './MashupCutPiano.m4a',
    './MashupCutVocals.m4a'
];

const trackNames = [
    'Bass',
    'Drums',
    'Guitar',
    'Other',
    'Piano',
    'Vocals'
];

document.addEventListener('DOMContentLoaded', async () => {
    await initAudioContext();
    await preloadAllTracks(trackSources);
    createTrackControls(trackSources.length);
});

function createTrackControls(numTracks) {
    const container = document.getElementById('track-controls-container');

    for (let i = 0; i < numTracks; i++) {
        const trackControl = document.createElement('div');
        trackControl.className = 'track-control';
        trackControl.id = `track-${i}`;

        trackControl.innerHTML = `
        <div class="track-title">${trackNames[i]}</div>
        <div class="track-buttons">
          <img src="images/mute_button.png" alt="Mute" class="track-button mute-button" onclick="toggleMute(${i})" id="muteButton-${i}" style="cursor: pointer;">
        </div>
        <div class="volume-control">
          <input type="range" min="0" max="100" value="100" id="volume-slider-${i}" onchange="setVolume(${i}, this.value)">
        </div>
      `;
  
      container.appendChild(trackControl);
    }

        const generalTrackControl = document.createElement('div');
        generalTrackControl.className = 'general-track-control';

        generalTrackControl.innerHTML = `
      <div class="track-title">General</div>
      <div class="track-buttons"></div>
      <div class="volume-control">
        <input type="range" min="0" max="100" value="100" id="volume-slider-${numTracks}" onchange="setAllVolumes(this.value)">
      </div>
      <div class="play-pause-button">
        <img src="images/play_pause_button.png" alt="Play/Pause" onclick="handlePlayPause()" id="playPauseButton" style="cursor: pointer;">
      </div>
      <div class="stop-button">
        <img src="images/stop_button.png" alt="Stop" onclick="stopTrack()" id="stopButton" style="cursor: pointer;">
      </div>
      `;

  container.appendChild(generalTrackControl);
}

  
  window.handlePlayPause = async () => {
    await togglePlayPause();
  };
  
  window.stopTrack = () => {
    stopTracks();
  };
  
  window.toggleMute = toggleMute;
  window.setVolume = (trackIndex, volume) => {
    setVolume(trackIndex, volume);
  };
  window.setAllVolumes = (volume) => {
    for (let i = 0; i < trackSources.length; i++) {
        setVolume(i, volume);
        document.getElementById(`volume-slider-${i}`).value = volume;  // Sync individual sliders
    }
};