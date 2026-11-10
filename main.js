import { initAudioContext, preloadAllTracks, togglePlayPause, stopTracks, toggleLocalTrackPlayPause,
  toggleMute, setVolume, setMasterVolume, toggleSolo, switchTrackLevel, downloadPDF, switchInstrument,
  getPlaybackState, seek, setLoopPoint, toggleLoop, clearLoop } from './audioLogic.js';
import { TRACKS, INITIAL_LEVEL, hasLevels, instrumentImage, instrumentLabel, trackLabel, levelImage } from './config.js';

document.addEventListener('DOMContentLoaded', loadApp);
document.getElementById('retry-button').addEventListener('click', loadApp);

const MEGABYTE = 1024 * 1024;

// Barre : 85 % pour le téléchargement, 15 % pour le décodage. Le texte n'est mis à jour
// que quand il change (il est annoncé par les lecteurs d'écran).
function showLoadingProgress({ receivedBytes, totalBytes, decodedTracks, totalTracks }) {
    const message = document.getElementById('loading-message');
    const bar = document.getElementById('progress-bar');

    const downloadShare = totalBytes ? Math.min(receivedBytes / totalBytes, 1) : decodedTracks / totalTracks;
    bar.style.width = `${(downloadShare * 0.85 + (decodedTracks / totalTracks) * 0.15) * 100}%`;

    // Taille totale connue dès que chaque piste a répondu ; avant, on ne connaît pas les Mo.
    const downloading = totalBytes ? receivedBytes < totalBytes : decodedTracks === 0;

    let text;
    if (downloading) {
        text = totalBytes
            ? `Téléchargement des pistes audio : ${Math.floor(receivedBytes / MEGABYTE)} / ${Math.ceil(totalBytes / MEGABYTE)} Mo`
            : 'Téléchargement des pistes audio…';
    } else if (decodedTracks < totalTracks) {
        text = `Préparation des pistes : ${decodedTracks} / ${totalTracks}`;
    } else {
        text = 'Prêt !';
    }
    if (message.textContent !== text)
        message.textContent = text;
}

async function loadApp() {
    const message = document.getElementById('loading-message');
    const retryButton = document.getElementById('retry-button');
    message.textContent = 'Chargement en cours...';
    retryButton.hidden = true;

    try {
        await initAudioContext();
        await preloadAllTracks(showLoadingProgress);
    } catch (error) {
        // Les pistes déjà chargées restent en cache : réessayer ne recharge que les échecs.
        message.textContent = 'Impossible de charger les pistes audio. Vérifiez votre connexion.';
        retryButton.hidden = false;
        return;
    }

    createTrackControls();
    startTransport();
    document.getElementById('loading-screen').style.display = 'none';
}

// --- Timeline et boucle A-B ------------------------------------------------------------

function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function spokenTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
}

let isSeeking = false;     // l'utilisateur fait glisser la barre de temps
let lastSpokenSecond = -1; // aria-valuetext n'est mis à jour qu'une fois par seconde

function refreshTransport() {
    const { position, duration, loop } = getPlaybackState();
    const slider = document.getElementById('seek-slider');

    if (Number(slider.max) !== duration)
        slider.max = duration;
    const shown = isSeeking ? Number(slider.value) : position;
    if (!isSeeking)
        slider.value = position;

    document.getElementById('time-current').textContent = formatTime(shown);
    document.getElementById('time-total').textContent = formatTime(duration);
    if (Math.floor(shown) !== lastSpokenSecond) {
        lastSpokenSecond = Math.floor(shown);
        slider.setAttribute('aria-valuetext', `${spokenTime(shown)} sur ${spokenTime(duration)}`);
    }

    // Zone de boucle sous la barre : de A à B, ou un simple repère tant que B n'est pas posé.
    const region = document.getElementById('loop-region');
    region.hidden = loop.start === null || !duration;
    if (!region.hidden) {
        const end = loop.end ?? loop.start;
        region.style.left = `${(loop.start / duration) * 100}%`;
        region.style.width = `${Math.max(((end - loop.start) / duration) * 100, 0.4)}%`;
        region.classList.toggle('inactive', !loop.active);
    }

    const toggle = document.getElementById('loop-toggle-button');
    toggle.disabled = loop.start === null || loop.end === null;
    toggle.setAttribute('aria-pressed', String(loop.active));
    document.getElementById('loop-clear-button').disabled = loop.start === null;

    let info = '';
    if (loop.start !== null && loop.end !== null)
        info = `${formatTime(loop.start)} → ${formatTime(loop.end)}${loop.active ? '' : ' (désactivée)'}`;
    else if (loop.start !== null)
        info = `A à ${formatTime(loop.start)} — placez B`;
    const infoElement = document.getElementById('loop-info');
    if (infoElement.textContent !== info)
        infoElement.textContent = info;
}

function startTransport() {
    const transport = document.getElementById('transport');
    const slider = document.getElementById('seek-slider');
    transport.hidden = false;

    // Glisser met à jour l'affichage ; la position n'est appliquée qu'au relâchement
    // (ou à chaque touche au clavier, qui déclenche aussi « change »).
    slider.addEventListener('pointerdown', () => { isSeeking = true; });
    slider.addEventListener('input', () => { isSeeking = true; });
    slider.addEventListener('change', () => {
        seek(Number(slider.value));
        isSeeking = false;
        refreshTransport();
    });
    // Clic sans déplacement (aucun « change ») : on reprend le suivi de la lecture.
    const stopSeeking = () => setTimeout(() => { isSeeking = false; }, 0);
    slider.addEventListener('pointerup', stopSeeking);
    slider.addEventListener('blur', stopSeeking);

    // Après une action de boucle, l'affichage (boutons activés, zone, texte) est mis à jour
    // tout de suite, sans attendre le prochain rafraîchissement.
    transport.addEventListener('click', event => {
        dispatch(transportActions, event);
        Promise.resolve().then(refreshTransport);
    });

    // 5 rafraîchissements par seconde suffisent pour une barre de quelques minutes.
    refreshTransport();
    setInterval(refreshTransport, 200);
}

const transportActions = {
    'loop-start': () => setLoopPoint('start'),
    'loop-end': () => setLoopPoint('end'),
    'loop-toggle': () => toggleLoop(),
    'loop-clear': () => clearLoop(),
};

// --- Construction de l'interface -------------------------------------------------------

// Bouton contenant une image. L'image est décorative (alt vide) : le nom du bouton vient
// d'aria-label. `pressed` (true/false) en fait un bouton à bascule (aria-pressed).
function iconButton({ id, className = '', image, label, action, trackIndex, pressed, extra = '' }) {
    const attributes = [
        'type="button"',
        `class="icon-button ${className}"`,
        id ? `id="${id}"` : '',
        `data-action="${action}"`,
        trackIndex !== undefined ? `data-track="${trackIndex}"` : '',
        `aria-label="${label}"`,
        `title="${label}"`,
        pressed !== undefined ? `aria-pressed="${pressed}"` : '',
        extra,
    ].filter(Boolean).join(' ');
    return `<button ${attributes}><img src="${image}" alt=""></button>`;
}

function trackTitleHTML(trackIndex) {
    const { instruments } = TRACKS[trackIndex];

    if (instruments.length === 1) {
        return `<img src="${instrumentImage(instruments[0])}" alt="${instrumentLabel(instruments[0])}" class="track-title track-title-image">`;
    }

    const choices = instruments.map((instrument, choiceIndex) => iconButton({
        className: choiceIndex === 0 ? 'active' : '',
        image: instrumentImage(instrument),
        label: instrumentLabel(instrument),
        action: 'instrument',
        trackIndex,
        pressed: choiceIndex === 0,
        extra: `data-instrument="${instrument}"`,
    })).join('');
    return `<div class="instrument-switcher" role="group" aria-label="Instrument">${choices}</div>`;
}

function trackControlHTML(trackIndex) {
    const name = trackLabel(trackIndex);
    // Une piste sans niveaux garde des boutons invisibles pour conserver l'alignement des colonnes.
    const levelsClass = hasLevels(trackIndex) ? '' : ' is-hidden';
    const levels = TRACKS[trackIndex].levels;

    return `
        <div class="track-title">
            ${trackTitleHTML(trackIndex)}
        </div>
        <div class="upper-part">
          <div class="left-buttons">
            ${iconButton({ id: `soloButton-${trackIndex}`, className: 'track-button mute-button',
                image: 'images/Solo/Solo.png', label: 'Solo', action: 'solo', trackIndex, pressed: false })}
            ${iconButton({ id: `muteButton-${trackIndex}`, className: 'track-button mute-button',
                image: 'images/Mute/mute.png', label: 'Muet', action: 'mute', trackIndex, pressed: false })}
            ${iconButton({ id: `levelButton-${trackIndex}`, className: `track-button level-button${levelsClass}`,
                image: levelImage(INITIAL_LEVEL),
                label: levels ? `Niveau ${INITIAL_LEVEL} sur ${levels}, changer de niveau` : 'Niveau',
                action: 'level', trackIndex })}
            ${iconButton({ id: `downloadButton-${trackIndex}`, className: `track-button level-button${levelsClass}`,
                image: 'images/Download/Download.png', label: 'Télécharger la partition', action: 'download', trackIndex })}
          </div>
          <div class="volume-control">
            <input type="range" min="0" max="100" value="100" id="volume-slider-${trackIndex}"
                data-action="volume" data-track="${trackIndex}" aria-label="Volume ${name}">
          </div>
        </div>
        <div class="lower-part">
          <div class="play-pause-button">
            ${iconButton({ id: `playPauseButton-${trackIndex}`, image: 'images/PlayPause/Play_pause_neg.png',
                label: `Écouter ${name} en solo`, action: 'track-play', trackIndex, pressed: false })}
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
            ${iconButton({ id: 'stopButton', className: 'track-button stop-button',
                image: 'images/Stop/Stop_neg.png', label: 'Stop', action: 'stop' })}
          </div>
          <div class="volume-control">
            <input type="range" min="0" max="100" value="100" id="volume-slider-master"
                data-action="master-volume" aria-label="Volume général">
          </div>
        </div>
        <div class="lower-part">
          <div class="play-pause-button">
            ${iconButton({ id: 'playPauseButton', image: 'images/PlayPause/Play_pause_neg.png',
                label: 'Lecture / pause', action: 'play', pressed: false })}
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
        trackControl.setAttribute('role', 'group');
        trackControl.setAttribute('aria-label', trackLabel(trackIndex));
        trackControl.innerHTML = trackControlHTML(trackIndex);
        container.appendChild(trackControl);
    });

    const generalTrackControl = document.createElement('div');
    generalTrackControl.className = 'general-track-control';
    generalTrackControl.setAttribute('role', 'group');
    generalTrackControl.setAttribute('aria-label', 'Général');
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
