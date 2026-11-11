# Changelog

All notable changes to this project are listed here. Version numbers follow
[Semantic Versioning](https://semver.org/).

## [1.1.0] – 2026-11-11

### Added
- **Timeline**: elapsed and total time, and a seek bar that works while playing, paused or
  stopped.
- **A-B loop** to repeat a passage on all tracks at once, sample-accurately.
- **Master volume** that no longer overrides each track's own volume.
- **Loading progress** in megabytes, then decoded tracks, and an error screen with a
  "Retry" button that only reloads the tracks that failed.
- **Header** explaining the controls, page title, description and favicon.
- **Keyboard and screen reader support**: real buttons with French labels, toggle states,
  visible focus, named sliders.
- **Mobile support**: the mixer scrolls horizontally, the master column comes first on
  small screens, sound keeps playing with the iPhone ringer switch on silent
  (Safari 16.4+).
- **Automated tests** (Playwright) run by GitHub Actions on every push and pull request.
- English README (French kept in `README.fr.md`), screenshot and `CHANGELOG.md`.

### Changed
- Tracks are described in a single `config.js`, and the interface is generated from it:
  adding an instrument is a one-line change.
- Audio re-encoded from 320 to 160 kbps: the initial download goes from 63 to 32 MB.
- On phones, tablets and low-memory devices, tracks are decoded at 32 kHz (about 420 MB of
  memory instead of 630 MB).
- Decoded tracks are cached, so going back to a level already heard is instant.
- Repository history cleaned of old audio files: a clone goes from over 1 GB to about
  100 MB.

### Fixed
- Changing level or instrument while stopped had no effect on the next Play.
- Replaced audio sources kept running silently and could stop playback mid-song.
- Rapid clicks on level or instrument buttons could end in an inconsistent state.
- Solo, Mute and the volume sliders overrode each other.
- Tracks drifted out of sync by 50 ms after each pause when a level was changed.
- The Play button was nearly invisible while playing.
- The score download could fail in Firefox and Safari.

## [1.0.0] – 2024-11-03

First version: seven synchronized tracks with Solo, Mute, volume, three difficulty levels
per instrument, instrument choice on the wind sections and PDF score download.

[1.1.0]: https://github.com/Utrope/Multi-track-audio-reader/compare/v1.0...v1.1
[1.0.0]: https://github.com/Utrope/Multi-track-audio-reader/releases/tag/v1.0
