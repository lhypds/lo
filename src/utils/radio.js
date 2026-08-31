import { useSyncExternalStore } from "react";

// The tuner. One station sounding at a time, held here rather than in the card,
// because the sound is not the tile's render: the dashboard re-renders sixty
// ways an hour and an <audio> element rebuilt on any of them is a station that
// drops out mid-sentence. Same shelf as the venues and the layout next door,
// and the same kind of thing — a store because two moments of one card, either
// side of a re-render, have to be reading the same instrument.
//
// What is deliberately not held here is the choice to play. Autoplay is the
// browser's line and lo's own: sound starts on a press and only on a press, so
// a status is never restored — a reload opens quiet, whatever was sounding when
// the tab went.
//
// Status is one of:
//   "idle"     nothing sounding — the face is offering the frequency
//   "tuning"   play was pressed and the stream has not spoken yet, or it was
//              sounding and has gone quiet to buffer
//   "on"       sound is coming out
//   "dead"     the stream would not answer — pressing the face tries it again

let state = { stations: [], index: 0, status: "idle", current: null };
let audio = null;
let audioContext = null;
let audioSource = null;
let analyser = null;
const listeners = new Set();

// A long enough slice to make speech and music visibly different, but not so
// long that the trace reads behind what is coming out of the speaker. The
// drawing downsamples this again to the number of pixels it has to spend, and
// spends the first half of the buffer looking for somewhere steady to start
// from (see triggerOffset), so the slice is twice what is ever drawn at once.
export const RADIO_WAVEFORM_SAMPLES = 2048;
export const RADIO_SPECTRUM_BINS = RADIO_WAVEFORM_SAMPLES / 2;

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return state;
}

function emit(next) {
  state = next;
  for (const listener of listeners) listener();
}

export function useRadio() {
  return useSyncExternalStore(subscribe, snapshot);
}

// Read the sound without putting sixty waveform frames a second through React.
// The caller owns and reuses the typed array; this fills it straight from the
// analyser that is already in the playback path. False means there is no live
// sample — stopped, buffering, unsupported — and the centre line is the honest
// picture of it.
export function readRadioWaveform(samples) {
  if (!(samples instanceof Uint8Array)) return false;
  if (!analyser) {
    samples.fill(128);
    return false;
  }
  analyser.getByteTimeDomainData(samples);
  return true;
}

// The other reading of the same analyser, for the Winamp-style face. Kept
// beside the time-domain reader so changing visualization never changes the
// audio graph or starts a second analysis pass over the station.
export function readRadioSpectrum(bins) {
  if (!(bins instanceof Uint8Array)) return false;
  if (!analyser) {
    bins.fill(0);
    return false;
  }
  analyser.getByteFrequencyData(bins);
  return true;
}

// The station on the face: the one sounding while one is, and the one the
// pointer stands on otherwise. Two questions rather than one because a new list
// can land while a station plays — crossing a grid line re-asks the server —
// and the sound must not follow the list: what is playing is what the reader
// pressed, not whatever now stands at its index.
export function shownStation(read = state) {
  return read.current ?? read.stations[read.index] ?? null;
}

// A new list from the server. The pointer finds the station that was on the
// face in it where it can — the one sounding, or the one the dial was resting
// on — so the reader is left looking at what they were looking at. Following
// the station rather than holding the index is the whole of it: a re-ranked
// list moves rows past a number that has not changed, and the tile answered a
// refresh nobody asked for by showing a different station. A playing station
// the new list no longer carries keeps sounding from `current` — the list is
// where the reader can go, not a ruling on where they are.
//
// Where the dial lands when nothing is sounding is a choice, and it is not the
// top of the list. The server ranks by distance, so opening at the first row
// means the same station every session for anyone who does not turn the dial —
// and the nearest transmitter is not the one a reader wants eight times out of
// eight. So a list arriving somewhere the tuner has not been is opened at a
// station picked out of it at random: eight verified stations were ranked for
// this place, and any of them is a fair answer to "what is on here".
//
// Only that list, though. A list that overlaps the one already held is the same
// place answering again — crossing a grid line re-asks the server, and so does
// a reload of the tile — and re-rolling there would change the name under a
// reader who is reading it, and undo a dial they had already turned.
export function tuneRadio(stations) {
  const rows = Array.isArray(stations) ? stations : [];
  const shown = shownStation();
  const at = shown ? rows.findIndex((row) => row.url === shown.url) : -1;
  const elsewhere = !rows.some((row) => state.stations.some((held) => held.url === row.url));
  let index;
  if (at >= 0) index = at;
  else if (elsewhere && rows.length > 0) index = Math.floor(Math.random() * rows.length);
  else index = Math.min(state.index, Math.max(0, rows.length - 1));
  emit({ ...state, stations: rows, index });
}

// The element is let go before it is quieted, so its own error event — src=""
// is an error to an <audio> — arrives addressed to nobody: every listener below
// checks it is still speaking for the element that is `audio` now.
function drop() {
  if (!audio) return;
  const element = audio;
  audio = null;
  analyser?.disconnect();
  audioSource?.disconnect();
  analyser = null;
  audioSource = null;
  element.pause();
  element.src = "";
}

export function stopRadio() {
  drop();
  emit({ ...state, status: "idle", current: null });
}

function play(station) {
  drop();
  // The signed same-origin address is what lets Web Audio inspect the stream;
  // direct station URLs are kept as a compatibility path for an older server
  // answering a newer client, but are deliberately not put through an analyser
  // because cross-origin media would be muted there by the browser.
  const sourceUrl = station.listenUrl || station.url;
  const element = new Audio(sourceUrl);
  audio = element;

  if (station.listenUrl) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      let nextAnalyser = null;
      let nextSource = null;
      try {
        audioContext ??= new AudioContext();
        nextAnalyser = audioContext.createAnalyser();
        nextAnalyser.fftSize = RADIO_WAVEFORM_SAMPLES;
        // Only the spectrum reading is smoothed here; the bars do their own
        // attack and fall on top of it, so the analyser is asked for a little
        // less than it would take to make them sluggish.
        nextAnalyser.smoothingTimeConstant = 0.6;
        nextSource = audioContext.createMediaElementSource(element);
        nextSource.connect(nextAnalyser);
        nextAnalyser.connect(audioContext.destination);
        audioSource = nextSource;
        analyser = nextAnalyser;
        // play() and resume() are both made inside the reader's press. Browsers
        // that suspend Web Audio until a gesture therefore hear the first note,
        // rather than seeing a moving trace over silence.
        audioContext.resume().catch(() => {});
      } catch {
        // Web Audio is an enhancement, not a condition of listening. If a
        // browser cannot build the graph, leave the ordinary media element to
        // play directly and let the drawing settle on its centre line.
        nextAnalyser?.disconnect();
        nextSource?.disconnect();
        // Once a media element has become a Web Audio source the browser no
        // longer sends it straight to the speakers. If construction failed
        // after that hand-over, reconnect the source to the destination so the
        // radio remains a radio even without its drawing.
        try {
          nextSource?.connect(audioContext.destination);
          audioSource = nextSource;
        } catch {
          // Nothing else to repair: the ordinary element still gets its chance
          // in browsers that rejected the source before taking it over.
        }
        analyser = null;
        if (!nextSource) audioSource = null;
      }
    }
  }
  element.addEventListener("playing", () => {
    if (audio === element) emit({ ...state, status: "on" });
  });
  element.addEventListener("error", () => {
    if (audio === element) emit({ ...state, status: "dead" });
  });
  // Gone quiet to buffer — said as tuning rather than left looking on, because
  // a meter beating over silence reads as the reader's speakers having died.
  element.addEventListener("waiting", () => {
    if (audio === element && state.status === "on") emit({ ...state, status: "tuning" });
  });
  // A radio stream has no end; one that reaches one was not a station — a
  // finite file behind a mount, or a licensing apology that says its piece and
  // stops. "No signal" is the honest reading of either, and quieter than
  // letting the tile sit looking on over a stream that has finished.
  element.addEventListener("ended", () => {
    if (audio === element) emit({ ...state, status: "dead" });
  });
  emit({ ...state, status: "tuning", current: station });
  element.play().catch(() => {
    if (audio === element) emit({ ...state, status: "dead" });
  });
}

// The press on the face: sound if quiet, quiet if sounding. From "dead" it
// tries the same station again — the press is the retry, there being nothing
// else a reader facing "no signal" would mean by it.
export function toggleRadio() {
  if (state.status === "on" || state.status === "tuning") return stopRadio();
  const station = shownStation();
  if (station) play(station);
}

// One step along the dial, wrapping at either end. Turning the dial while
// sound is on retunes to what it lands on — that is what turning a dial is —
// and while quiet it only moves the face. A shown station the list no longer
// carries has no place to step from, so the step enters the list at the end
// the turn was headed for.
function step(delta) {
  const { stations } = state;
  if (stations.length === 0) return;
  const shown = shownStation();
  const at = shown ? stations.findIndex((row) => row.url === shown.url) : -1;
  const index = at === -1 ? (delta > 0 ? 0 : stations.length - 1) : (at + delta + stations.length) % stations.length;
  if (state.status === "on" || state.status === "tuning") {
    emit({ ...state, index });
    play(stations[index]);
  } else {
    emit({ ...state, index, status: "idle", current: null });
  }
}

export function nextStation() {
  step(1);
}

export function prevStation() {
  step(-1);
}

// The sound is the tile's: while a radio card stands anywhere on the page it
// keeps sounding — across re-renders, page turns of the strip, and the modals
// that open over the dashboard — and when the last one goes it stops, whether
// the reader took the card off or left for another screen. A stream sounding
// with its one control unmounted would be a noise nothing on the page owns up
// to. Counted rather than assumed singular, and settled a tick later, so the
// remount inside a re-render (StrictMode rehearses exactly this) reads as the
// tile still standing.
let tiles = 0;

export function holdRadioTile() {
  tiles += 1;
  return () => {
    tiles -= 1;
    setTimeout(() => {
      if (tiles === 0) stopRadio();
    }, 0);
  };
}
