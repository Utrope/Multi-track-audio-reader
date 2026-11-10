import { initAudioContext, preloadAllTracks, togglePlayPause, stopTracks, toggleLocalTrackPlayPause,
  toggleMute, setVolume, setMasterVolume, toggleSolo, switchTrackLevel, downloadPDF, switchInstrument } from './audioLogic.js';
import { TRACKS, INITIAL_LEVEL, hasLevels, instrumentImage, levelImage } from './config.js';

document.addEventListener('DOMContentLoaded', loadApp);
document.getElementById('retry-button').addEventListener('click', loadApp);

async function loadApp() {
    const message = document.getElementById('loading-message');
    const retryButton = document.getElementById('retry-button');
    message.textContent = 'Chargement en cours...';
    retryButton.hidden = true;

    try {
        await initAudioContext();
        await preloadAllTracks();
    } catch (error) {
        // Les pistes déjà chargées restent en cache : réessayer ne recharge que les échecs.
        message.textContent = 'Impossible de charger les pistes audio. Vérifiez votre connexion.';
        retryButton.hidden = false;
        return;
    }

    createTrackControls();
    document.getElementById('loading-screen').style.display = 'none';
}

// --- Construction de l'interface -------------------------------------------------------

function trackTitleHTML(trackIndex) {
    const { instruments } = TRACKS[trackIndex];

    if (instruments.length === 1) {
        return `<img src="${instrumentImage(instruments[0])}" alt="${instruments[0]}" class="track-title track-title-image">`;
    }

    const choices = instruments.map((instrument, choiceIndex) => `
        <img src="${instrumentImage(instrument)}" alt="${instrument}"
            class="${choiceIndex === 0 ? 'active' : ''}"
            data-action="instrument" data-track="${trackIndex}" data-instrument="${instrument}">`).join('');
    return `<div class="instrument-switcher">${choices}</div>`;
}

function trackControlHTML(trackIndex) {
    // Une piste sans niveaux garde des boutons invisibles pour conserver l'alignement des colonnes.
    const levelsClass = hasLevels(trackIndex) ? '' : ' is-hidden';

    return `
        <div class="track-title">
            ${trackTitleHTML(trackIndex)}
        </div>
        <div class="upper-part">
          <div class="left-buttons">
            <img src="images/Solo/Solo.png" alt="Solo" class="track-button mute-button" data-action="solo" data-track="${trackIndex}" id="soloButton-${trackIndex}">
            <img src="images/Mute/mute.png" alt="Mute" class="track-button mute-button" data-action="mute" data-track="${trackIndex}" id="muteButton-${trackIndex}">
            <img src="${levelImage(INITIAL_LEVEL)}" alt="Level" class="track-button level-button${levelsClass}" data-action="level" data-track="${trackIndex}" id="levelButton-${trackIndex}">
            <img src="images/Download/Download.png" alt="Download" class="track-button level-button${levelsClass}" data-action="download" data-track="${trackIndex}" id="downloadButton-${trackIndex}">
          </div>
          <div class="volume-control">
            <input type="range" min="0" max="100" value="100" id="volume-slider-${trackIndex}" data-action="volume" data-track="${trackIndex}">
          </div>
        </div>
        <div class="lower-part">
          <div class="play-pause-button">
            <img src="images/PlayPause/Play_pause_neg.png" alt="Play/Pause" data-action="track-play" data-track="${trackIndex}" id="playPauseButton-${trackIndex}">
          </div>
        </div>
    `;
}

function generalControlHTML() {
    return `
        <div class="track-title">
            <img src="images/Instruments/general.png" alt="Général" class="track-title-image">
        </div>
        <div class="upper-part">
          <div class="stop-button">
            <img src="images/Stop/Stop_neg.png" alt="Stop" class="track-button stop-button" data-action="stop" id="stopButton">
          </div>
          <div class="volume-control">
            <input type="range" min="0" max="100" value="100" id="volume-slider-master" data-action="master-volume">
          </div>
        </div>
        <div class="lower-part">
          <div class="play-pause-button">
            <img src="images/PlayPause/Play_pause_neg.png" alt="Play/Pause" data-action="play" id="playPauseButton">
          </div>
        </div>
    `;
}

function createTrackControls() {
    const container = document.getElementById('track-controls-container');

    TRACKS.forEach((_, trackIndex) => {
        const trackControl = document.createElement('div');
        trackControl.className = 'track-control';
        trackControl.id = `track-${trackIndex}`;
        trackControl.innerHTML = trackControlHTML(trackIndex);
        container.appendChild(trackControl);
    });

    const generalTrackControl = document.createElement('div');
    generalTrackControl.className = 'general-track-control';
    generalTrackControl.innerHTML = generalControlHTML();
    container.appendChild(generalTrackControl);
}

// --- Événements -------------------------------------------------------------------------
// Un seul écouteur par type d'événement : chaque élément interactif porte data-action
// (et data-track pour une piste).

const clickActions = {
    play: () => togglePlayPause(),
    stop: () => stopTracks(),
    solo: (trackIndex) => toggleSolo(trackIndex),
    mute: (trackIndex) => toggleMute(trackIndex),
    level: (trackIndex) => switchTrackLevel(trackIndex),
    download: (trackIndex) => downloadPDF(trackIndex),
    'track-play': (trackIndex) => toggleLocalTrackPlayPause(trackIndex),
    instrument: (trackIndex, element) => switchInstrument(trackIndex, element.dataset.instrument),
};

const inputActions = {
    volume: (trackIndex, element) => setVolume(trackIndex, element.value),
    'master-volume': (_, element) => setMasterVolume(element.value),
};

function dispatch(actions, event) {
    const element = event.target.closest('[data-action]');
    if (!element)
        return;

    const action = actions[element.dataset.action];
    if (!action)
        return;

    const trackIndex = Number(element.dataset.track);
    Promise.resolve()
        .then(() => action(trackIndex, element))
        .catch(error => console.error(`Action "${element.dataset.action}" failed:`, error));
}

const controlsContainer = document.getElementById('track-controls-container');
controlsContainer.addEventListener('click', event => dispatch(clickActions, event));
controlsContainer.addEventListener('input', event => dispatch(inputActions, event));
