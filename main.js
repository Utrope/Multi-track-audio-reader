import { initAudioContext, preloadAllTracks, togglePlayPause, stopTracks, toggleLocalTrackPlayPause, toggleMute, setVolume, toggleSolo } from './audioLogic.js';

const trackSources = [
    './tracks/bass_lvl1.wav',
    './tracks/drum_lvl1.wav',
    './tracks/guitar_lvl1.wav',
    './tracks/prod.wav',
];

const trackNames = [
    'bass.png',
    'drums.png',
    'guitar.png',
    'other.png',
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
        <div class="track-title">
        <img src="images/${trackNames[i]}" alt="${trackNames[i].split('.')[0]}" class="track-title-image">
        </div>
        <div class="upper-part">
          <div class="left-buttons">
            <img src="images/track_button_off.png" alt="Track" class="track-button mute-button" onclick="" id="trackButton" style="cursor: pointer;">
            <img src="images/fx_button_off.png" alt="FX" class="track-button mute-button" onclick="" id="fxButton" style="cursor: pointer;">
            <img src="images/solo_button_off.png" alt="Solo" class="track-button mute-button" onclick="toggleSolo(${i})" id="soloButton-${i}" style="cursor: pointer;">
            <img src="images/mute_button_off.png" alt="Mute" class="track-button mute-button" onclick="toggleMute(${i})" id="muteButton-${i}" style="cursor: pointer;">
            <img src="images/stop_button.png" alt="Stop" class="track-button mute-button" onclick="stopTrack()" id="stopButton" style="cursor: pointer;">
            </div>
          <div class="volume-control">
            <input type="range" min="0" max="100" value="100" id="volume-slider-${i}" onchange="setVolume(${i}, this.value)">
          </div>
        </div>
        <div class="lower-part">
        <div class="play-pause-button">
          <img src="images/play_pause_button.png" alt="Play/Pause" onclick="handleLocalTrackPlayPause(${i})" id="playPauseButton-${i}" style="cursor: pointer;">
        </div>
      </div>
    `;
  
      container.appendChild(trackControl);
    }

        const generalTrackControl = document.createElement('div');
        generalTrackControl.className = 'general-track-control';

        generalTrackControl.innerHTML = `
      <div class="track-title">General</div>
      <div class="upper-part">
      <div class="left-buttons">
        <img src="images/stop_button.png" alt="Stop" class="track-button stop-button" onclick="stopTrack()" id="stopButton" style="cursor: pointer;">
      </div>
      <div class="volume-control">
        <input type="range" min="0" max="100" value="100" id="volume-slider-${numTracks}" onchange="setAllVolumes(this.value)">
      </div>
    </div>
    <div class="lower-part">
      <div class="play-pause-button">
        <img src="images/play_pause_button.png" alt="Play/Pause" onclick="handlePlayPause()" id="playPauseButton" style="cursor: pointer;">
      </div>
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

window.toggleSolo = (trackIndex) => {
  toggleSolo(trackIndex);
};

window.handleLocalTrackPlayPause = (trackIndex) => {
  toggleLocalTrackPlayPause(trackIndex);
}