import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RADIO_SPECTRUM_BINS,
  RADIO_WAVEFORM_SAMPLES,
  readRadioSpectrum,
  readRadioWaveform,
} from "../../utils/radio.js";
import styles from "./radio.module.css";

// Readings of one sound, drawn onto a canvas. Every value that reaches the ink
// comes out of the analyser sitting in the playback path (see
// readRadioWaveform) — there is no stand-in wave anywhere in this file. When
// there is no live sample to draw, because nothing is sounding or the stream is
// still opening, the face shows its centre line and holds still. A meter that
// moves over silence is not a reading of anything.
//
// The three waveforms first, then the spectrum, then nothing at all. `blank` is
// a face like the others rather than a way of switching the drawing off: some
// readers want the station and its buttons and no movement on the tile, and
// pressing round to it is how they say so. It is also the one face that costs
// nothing — no analyser is read and no frame is asked for while it is up.
const MODES = ["scope", "mirror", "ring", "winamp", "blank"];
const MODE_KEY = "lo:radio-visualization";

// Which face a reader who has never pressed the drawing is shown. Named rather
// than taken as the head of the list, so that where the cycle starts and what
// order it runs in stay two separate decisions. The mirrored waveform is the
// one that reads at a glance: the bare trace is a hairline scribble at tile
// size, and this is the same reading with the amplitude filled in, which is
// what makes it legible from across a desk.
const DEFAULT_MODE = "mirror";

// Winamp Classic's analyzer tops out near thirty-five frames a second, and that
// clipped rhythm is half of why it reads as lively rather than smeared. It is
// also as much as a 144px square deserves on a dashboard with other work to do.
const FRAME_MS = 33;

// Nineteen chunky log-spaced bands, sixteen segments each, and a cap that holds
// the peak before falling — the original's construction. Its black field and
// colour ramp are not borrowed with it: this analyzer is ink on the card's own
// paper, like every other mark on the dashboard, so the tile does not carry a
// black square around whenever this is the selected reading.
const BARS = 19;
const SEGMENTS = 16;

function savedMode() {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return MODES.includes(value) ? value : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

// Canvas takes colours, not custom properties, and lo has one palette rather
// than a light and a dark one — so these are read off the element once a size,
// not once a frame, where asking would cost a style recalculation per tick.
function readInk(element) {
  const style = getComputedStyle(element);
  const pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: pick("--ink", "#0b0b0b"),
    muted: pick("--muted", "#707070"),
    line: pick("--line", "#d8d8d8"),
  };
}

// A scope that starts wherever the buffer happens to begin draws a steady tone
// as a wave sliding sideways at random, which reads as noise rather than as
// sound. Real oscilloscopes answer this with a trigger: begin at a rising
// crossing of the centre, so the same part of the waveform lands in the same
// place every frame and the picture stands still while the sound moves.
function triggerOffset(samples, span) {
  const limit = samples.length - span;
  for (let index = 1; index < limit; index += 1) {
    if (samples[index - 1] < 128 && samples[index] >= 128) return index;
  }
  return 0;
}

// One column of the drawing out of the several samples behind it: the one
// furthest from silence, rather than their average, which would flatten a
// cymbal into the quiet either side of it.
function columnPeak(samples, from, to) {
  let peak = 0;
  for (let index = from; index < to; index += 1) {
    const value = (samples[index] - 128) / 128;
    if (Math.abs(value) > Math.abs(peak)) peak = value;
  }
  return peak;
}

// The buffer reduced to the number of columns this tile can actually spend,
// eased towards rather than replaced so compressed radio speech does not
// strobe. Both ends are returned to the axis, which turns an arbitrary instant
// of audio into one deliberate mark inside the frame — except on the ring,
// which has no ends to return: tapering there would leave a quiet notch at
// twelve o'clock, in a figure whose whole point is that it closes.
function fillColumns(columns, samples, tapered = true) {
  const span = Math.floor(samples.length / 2);
  const start = triggerOffset(samples, span);
  const bucket = span / columns.length;
  for (let index = 0; index < columns.length; index += 1) {
    const from = start + Math.floor(index * bucket);
    const to = Math.max(from + 1, start + Math.floor((index + 1) * bucket));
    const taper = tapered ? Math.sin((index / (columns.length - 1)) * Math.PI) ** 0.35 : 1;
    const target = columnPeak(samples, from, to) * taper;
    columns[index] += (target - columns[index]) * 0.6;
  }
}

// Audio bands read the way the ear and Winamp's analyzer read them: ample room
// for bass at the left, the wide treble range folded into progressively broader
// bins at the right. Bars rise at once and fall in steps; the cap waits, then
// falls more slowly — that held peak is the detail that makes this recognisably
// Winamp rather than a generic row of equalizer bars.
function updateBars(bins, levels, peaks, holds) {
  // Where the bands stop. The buffer runs to the Nyquist rate — near 24kHz on
  // most machines — and mapping the analyzer across all of it leaves the
  // right-hand bands permanently dark: a 128kbps stream is lowpassed around
  // 15kHz before it ever leaves the station, and speech, which is most of what
  // a radio carries, has next to nothing above 8. Read as a fraction of the
  // buffer rather than as a frequency because the fraction is what the analyser
  // hands over, and the two sample rates a browser picks put this within a
  // tenth of the same place either way.
  const lastBin = Math.max(BARS + 1, Math.floor(bins.length * 0.34));
  const logFirst = Math.log(2);
  const logLast = Math.log(lastBin);
  // Each band takes at least one bin of its own. Left to the logarithm alone
  // the lowest few would all resolve to the same bin and move in lockstep,
  // which reads as one wide bass bar rather than as four bands.
  let cursor = 2;
  for (let index = 0; index < BARS; index += 1) {
    const edge = Math.exp(logFirst + ((index + 1) / BARS) * (logLast - logFirst));
    const from = cursor;
    const to = Math.min(bins.length, Math.max(from + 1, Math.round(edge)));
    cursor = Math.min(bins.length - 1, to);
    // The loudest bin in the band rather than their average: the upper bands
    // are a hundred bins wide apiece, and averaging a cymbal across all of them
    // leaves the right-hand half of the analyzer dead through most music.
    let loudest = 0;
    for (let bin = from; bin < to; bin += 1) if (bins[bin] > loudest) loudest = bins[bin];
    const target = Math.min(1, Math.max(0, (loudest - 24) / 200) ** 0.8);

    levels[index] = target >= levels[index] ? target : Math.max(target, levels[index] - 0.05);
    if (levels[index] >= peaks[index]) {
      peaks[index] = levels[index];
      holds[index] = 9;
    } else if (holds[index] > 0) {
      holds[index] -= 1;
    } else {
      peaks[index] = Math.max(levels[index], peaks[index] - 0.024);
    }
  }
}

// `readable` is whether there is an analyser on the sound at all (see emit in
// utils/radio.js). It is not the same question as `active`: a station can be
// sounding perfectly well with nothing in the path to read it — an older server
// answering without a same-origin address, a mount whose codec lo has no
// decoder for, or the moment on iOS between the analyser being found blind and
// the same station coming back on the engine that can be read. All three draw
// the still centre line, and none of them spends a frame a thirtieth of a
// second redrawing it.
export default function RadioWave({ active, readable }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(savedMode);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;

    const samples = new Uint8Array(RADIO_WAVEFORM_SAMPLES);
    const bins = new Uint8Array(RADIO_SPECTRUM_BINS);
    const levels = new Float32Array(BARS);
    const peaks = new Float32Array(BARS);
    const holds = new Uint8Array(BARS);
    let columns = new Float32Array(48);
    let ghost = new Float32Array(48);
    let colours = readInk(canvas);
    let width = 1;
    let height = 1;
    let inset = 0;
    let animation = 0;
    let lastDraw = -FRAME_MS;

    // The canvas is told its own pixels rather than being stretched into them:
    // a 144px square on a 3× phone is a 432px bitmap, and a hairline drawn in
    // it is a hairline on the glass.
    function measure() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      colours = readInk(canvas);
      inset = Math.max(2, Math.min(8, width * 0.05));
      // One column per two device-independent pixels: finer than the eye reads
      // at this size, and coarse enough that the reduction still shows shape.
      // The ring counts its own instead — it is spending a circumference rather
      // than a width, and one tick every three pixels around it is the spacing
      // that reads as a dial of marks rather than as a solid band.
      const points =
        mode === "ring"
          ? Math.max(48, Math.min(180, Math.round((Math.PI * 2 * ring().radius) / 3)))
          : Math.max(24, Math.min(128, Math.round(width / 2)));
      if (columns.length !== points) {
        columns = new Float32Array(points);
        ghost = new Float32Array(points);
      }
    }

    // The scope's axis bent into a circle. The ring is where silence sits and
    // every tick straddles it, half in and half out, so the figure is the same
    // reading as the straight trace with its centre line closed on itself —
    // which is also why the circle is sized off the shorter side and left
    // floating in a box wider than it is: an ellipse of ticks is not a dial.
    function ring() {
      const outer = Math.max(1, Math.min(width, height) / 2 - inset);
      const reach = outer * 0.42;
      return { cx: width / 2, cy: height / 2, radius: outer - reach / 2, reach };
    }

    function trace(values, mid, reach, colour, lineWidth, alpha) {
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = colour;
      context.lineWidth = lineWidth;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.beginPath();
      const span = width - inset * 2;
      for (let index = 0; index < values.length; index += 1) {
        const x = inset + (index / (values.length - 1)) * span;
        const y = mid - values[index] * reach;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.restore();
    }

    function axis() {
      context.save();
      context.strokeStyle = colours.line;
      context.lineWidth = 1;
      context.setLineDash([2, 5]);
      context.beginPath();
      const mid = Math.round(height / 2) + 0.5;
      context.moveTo(inset, mid);
      context.lineTo(width - inset, mid);
      context.stroke();
      context.restore();
    }

    // The set is off: one dashed centre line, whatever reading is selected.
    // Three different faces for "no sound" would say the mode matters more than
    // whether the radio is playing, which is the wrong way round.
    function drawOff() {
      context.clearRect(0, 0, width, height);
      axis();
    }

    function drawScope() {
      context.clearRect(0, 0, width, height);
      axis();
      const mid = height / 2;
      const reach = height * 0.42;
      // The frame before this one, kept faintly behind: at thirty frames a
      // second one line alone reads as a flicker, and the one behind it is what
      // a scope's phosphor would still be showing.
      //
      // Both are hairlines. A stroke set in device-independent pixels comes out
      // multiplied by the display's ratio (see measure), so one here is two or
      // three real ones on the glass and stays a crisp line rather than a grey
      // smudge — which is what going under one would give on a display that has
      // no pixels to spare for it.
      trace(ghost, mid, reach, colours.muted, 0.75, 0.2);
      trace(columns, mid, reach, colours.ink, 1, 1);
      ghost.set(columns);
    }

    // The same waveform folded around its axis: the absolute amplitude sets
    // both edges, so the symmetry comes out of the sound rather than out of a
    // second animation laid over it.
    function drawMirror() {
      context.clearRect(0, 0, width, height);
      const mid = height / 2;
      const reach = height * 0.4;
      const span = width - inset * 2;
      context.save();
      context.globalAlpha = 0.22;
      context.fillStyle = colours.ink;
      context.beginPath();
      for (let index = 0; index < columns.length; index += 1) {
        const x = inset + (index / (columns.length - 1)) * span;
        const y = mid - Math.max(0.02, Math.abs(columns[index])) * reach;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      for (let index = columns.length - 1; index >= 0; index -= 1) {
        const x = inset + (index / (columns.length - 1)) * span;
        context.lineTo(x, mid + Math.max(0.02, Math.abs(columns[index])) * reach);
      }
      context.closePath();
      context.fill();
      context.restore();
      trace(columns, mid, reach, colours.ink, 0.9, 0.72);
    }

    // Ink on the card's paper, like every other face here. Quiet leaves a ring
    // of dots — the shortest a tick is allowed to be — and sound pushes each of
    // them out into a stroke, so the figure breathes in and out of its own
    // outline instead of appearing and disappearing.
    function drawRing() {
      context.clearRect(0, 0, width, height);
      const { cx, cy, radius, reach } = ring();
      context.save();
      context.strokeStyle = colours.ink;
      context.lineWidth = 1;
      context.lineCap = "round";
      context.beginPath();
      for (let index = 0; index < columns.length; index += 1) {
        // Divided by the count and not by the count less one: the last tick
        // stops one step short of the first rather than landing on top of it.
        const angle = (index / columns.length) * Math.PI * 2 - Math.PI / 2;
        const half = Math.max(0.75, Math.abs(columns[index]) * reach) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        context.moveTo(cx + cos * (radius - half), cy + sin * (radius - half));
        context.lineTo(cx + cos * (radius + half), cy + sin * (radius + half));
      }
      context.stroke();
      context.restore();
    }

    // Nothing at all — not even the centre line the other faces keep when the
    // set is off. This is the reader asking for a quiet tile, and a mark left
    // behind to prove the drawing is still there would be answering something
    // they did not ask.
    function drawBlank() {
      context.clearRect(0, 0, width, height);
    }

    function drawSpectrum() {
      context.fillStyle = colours.ink;
      context.clearRect(0, 0, width, height);
      const pad = Math.max(1.5, Math.min(6, width * 0.045));
      const areaWidth = width - pad * 2;
      const gap = Math.max(0.5, areaWidth * 0.012);
      const barWidth = (areaWidth - gap * (BARS - 1)) / BARS;
      const top = pad;
      const bottom = height - pad;
      const band = bottom - top;
      const step = band / SEGMENTS;
      const segmentHeight = Math.max(0.75, step - Math.max(0.5, step * 0.22));
      const capHeight = Math.max(0.75, step * 0.2);

      context.fillStyle = colours.ink;
      for (let index = 0; index < BARS; index += 1) {
        const x = pad + index * (barWidth + gap);
        const visible = Math.round(levels[index] * SEGMENTS);
        for (let segment = 0; segment < visible; segment += 1) {
          context.fillRect(x, bottom - (segment + 1) * step, barWidth, segmentHeight);
        }
      }
      context.save();
      context.globalAlpha = 0.6;
      for (let index = 0; index < BARS; index += 1) {
        if (peaks[index] <= 0.02) continue;
        const x = pad + index * (barWidth + gap);
        context.fillRect(x, Math.max(top, bottom - peaks[index] * band), barWidth, capHeight);
      }
      context.restore();
    }

    function render() {
      // Asked before the set is: blank is blank whether or not sound is coming
      // out, which is the difference between a face and a switched-off drawing.
      if (mode === "blank") return drawBlank();
      if (!active) return drawOff();
      // A false out of either reader means there is nothing to read — an older
      // server answering without a same-origin address, a browser that would
      // not build the graph, or one whose analyser was found to be no tap on
      // the sound at all (see judgeAnalyser). All three are the set sounding
      // where lo cannot hear it, and the centre line is the honest picture of
      // that, the same one the off state wears. Bars falling to an empty box,
      // which is what this used to draw, said the station had gone quiet.
      if (mode === "winamp") {
        if (!readRadioSpectrum(bins)) {
          levels.fill(0);
          peaks.fill(0);
          holds.fill(0);
          return drawOff();
        }
        updateBars(bins, levels, peaks, holds);
        return drawSpectrum();
      }
      if (!readRadioWaveform(samples)) {
        columns.fill(0);
        ghost.fill(0);
        return drawOff();
      }
      fillColumns(columns, samples, mode !== "ring");
      if (mode === "mirror") return drawMirror();
      if (mode === "ring") return drawRing();
      return drawScope();
    }

    function frame(time) {
      animation = window.requestAnimationFrame(frame);
      if (time - lastDraw < FRAME_MS) return;
      lastDraw = time;
      render();
    }

    // A waveform is the reading itself rather than decorative motion, so it
    // keeps sampling while sound is live; the loop is not started at all while
    // the set is off, while the blank face is up, or while there is nothing on
    // the sound to read, which is the whole of their idle cost. Each of those
    // three is a dependency of this effect, so the loop comes back by itself on
    // the station that can be heard again.
    const observer = new ResizeObserver(() => {
      measure();
      render();
    });
    observer.observe(canvas);
    measure();
    render();
    if (active && readable && mode !== "blank") animation = window.requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animation);
    };
  }, [active, readable, mode]);

  function cycleMode() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // A private browser may deny storage; the press still changes this card.
    }
  }

  return (
    <button
      type="button"
      className={styles.waveScope}
      onClick={cycleMode}
      aria-label={`${t("radio.visualization")}: ${t(`radio.visualizationMode.${mode}`)}`}
    >
      <canvas ref={canvasRef} className={styles.scope} />
    </button>
  );
}
