# Roadmap

What comes next, by version. Nothing here is scheduled: it is a plan, not a promise. Shipped
changes are listed in the [changelog](CHANGELOG.md).

## 1.2 – Better practice

Version 1.1 made the player reliable and easy to pick up. Version 1.2 should make it
genuinely useful in rehearsal. If only three items make it, they are the first three.

### Core

1. **Slow down without changing pitch** (for example 50 %, 75 %, 100 %)
   - The feature musicians ask for most, to work on a hard passage.
   - Web Audio can slow playback down, but that also lowers the pitch: keeping the pitch
     needs a time-stretching library (for example SoundTouch).
   - The largest item, likely a few days of work, and the one that would make the demo
     stand out.
   - Must keep all tracks in sync, the A-B loop and level changes working.
2. **Section markers** (intro, verse, chorus…) on the timeline
   - Declared in `config.js`, shown on the time bar.
   - Clicking a section jumps to it, or sets the A-B loop on it.
3. **Keyboard shortcuts**
   - Space: play / pause. A and B: loop points. Arrows: back / forward 5 s.
   - A short help panel opened with the "?" key.
   - Must not trigger while a slider or a button has focus.
4. **Remember settings** between visits
   - Volumes, levels, chosen instruments and the loop, kept with `localStorage`.
   - A way to reset everything.
5. **Share a loop with a link**
   - For example `…/#loop=1:02-1:18`: a teacher sends a student the exact passage to work on.
   - Opening the link places the loop and the position.

### Quality and maintenance

6. **Test on real devices and other browsers**
   - A real iPhone and a real Android phone: the blind spot of 1.1.
   - Add Firefox and WebKit (Safari's engine) to the automated tests.
7. **Clean up unused files**
   - Images that are never displayed.
   - Clarinet and trumpet scores have PDFs but no audio: either add the recordings and
     the instruments, or remove the files.
8. **Count-in before playback** ("1, 2, 3, 4"), to pick up the instrument after pressing
   Play.

## 2.0 – A general-purpose multitrack player

Deeper changes, worth a major version.

- **Several songs**, with a song picker and one configuration per song: the tool becomes
  the general multitrack reader its name promises.
- **English interface** alongside the French one.
- **Stream audio during playback** instead of decoding every track up front, to really
  solve memory use on phones.
