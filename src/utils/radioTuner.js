// The other way to play a radio station: fetch the stream, decode it here, and
// put the samples into the graph ourselves.
//
// It exists for one reason. iOS plays a chunked endless stream through a media
// pipeline Web Audio cannot see into (see judgeAnalyser in radio.js): the sound
// comes out of the speaker, and an analyser sitting in the path reads dead
// centre for as long as it plays. Nothing outside that pipeline can fix it — so
// this engine does not use it. `fetch` reads the bytes, mpg123 compiled to Web
// Assembly turns them into samples, and every block is scheduled as an
// AudioBufferSourceNode, which is a source Web Audio built itself and can
// therefore always be read.
//
// What it costs is that lo becomes the media player. The buffering, the
// underruns and the end of the stream are all this file's to notice and say out
// loud, where an <audio> element said them by itself; and a graph is not a
// media element, so the phone will not carry this one into the background or on
// to a lock screen. That is why this is the second engine rather than the only
// one: every browser that can be read through an ordinary element still is.
//
// The decoders are Web Assembly — 77KiB for MPEG, 226KiB for AAC — and each is
// fetched on the first station that needs it, which is to say never, on any
// browser that can be read the ordinary way, and never both unless a reader
// turns the dial from one kind of mount to the other.

// How much sound to have in hand before any of it is scheduled. An Icecast
// mount usually opens with a burst of several seconds, which fills this in one
// read; where it does not, this is the whole of the wait between the press and
// the first note, and also the whole of what stands between a slow network and
// a hole in the music.
const PREROLL_S = 0.8;

// The lead the scheduler takes when it starts, and when it has fallen behind
// the clock and has to start again. Short enough not to be heard as a delay,
// long enough that the block after it is unlikely to arrive late as well.
const LEAD_S = 0.12;

// What this engine can decode, and which decoder does it. Two are needed rather
// than one because half the dial is not MP3: across Paris, New York, Sydney and
// Berlin the mounts come back about even between MPEG and AAC, and a drawing
// that appeared on every other station would read as a bug rather than as a
// limit. Both libraries are the same author's and present the same four things
// — a constructor, `ready`, `decode`, `free` — so the loop below does not know
// which of them it is holding.
//
// Everything else, which is chiefly Ogg, is handed back to the ordinary media
// element: it can play plenty these cannot, and a station is better off
// sounding without its drawing than drawn and silent.
const DECODERS = [
  { type: /^audio\/(mpeg|mp3|mpg|x-mpeg)\b/i, load: () => import("mpg123-decoder").then((m) => m.MPEGDecoder) },
  { type: /^audio\/(aac|aacp|x-aac|mp4a)\b/i, load: () => import("@wasm-audio-decoders/aac").then((m) => m.AACDecoder) },
];

// What the directory calls a codec, said as the content-type the mount is
// expected to answer with. Only a hint: the header below is what actually
// chooses. Its whole job is to start the right Web Assembly download on the
// press rather than a round trip later, which on a phone is most of the wait
// between pressing play and the first mark appearing.
const HINTS = new Map([
  ["MP3", "audio/mpeg"],
  ["MP2", "audio/mpeg"],
  ["MP1", "audio/mpeg"],
  ["AAC", "audio/aac"],
  ["AAC+", "audio/aac"],
  ["AACP", "audio/aac"],
]);

const loading = new Map();

// One import per kind for the session, kept as the promise rather than the
// module, so two stations pressed in quick succession share the one fetch and
// compile. Null where nothing here can read the mount.
function decoderFor(type) {
  const found = DECODERS.find((decoder) => decoder.type.test(type));
  if (!found) return null;
  if (!loading.has(found)) loading.set(found, found.load());
  return loading.get(found);
}

// Play `url` into `destination`, and say what the set is doing while it does.
//
// `onStatus` is given lo's own words — "tuning", "on", "dead" — so the store
// above can pass them straight on: this engine reports the same four states a
// media element's events report, because a reader is looking at one radio and
// should not be able to tell which engine is behind the face.
//
// `onUnsupported` is the one thing a media element never has to say: that this
// mount is not something the decoder can read at all. It is not a failure of
// the station, so it is not "dead" — it is this engine standing aside.
export function playDecodedStream(url, { context, destination, codec, onStatus, onUnsupported }) {
  // Before anything else, and deliberately not awaited: the download and the
  // compile run alongside the stream opening rather than after it. A hint that
  // turns out to be wrong costs one unused import and nothing else — the real
  // decoder is chosen from the content-type either way.
  if (codec && HINTS.has(codec)) decoderFor(HINTS.get(codec));

  const controller = new AbortController();
  // Every source still scheduled or sounding. A stream is bought several
  // seconds ahead of the ear, so a retune that only stopped reading bytes would
  // go on playing the old station over the new one for as long as the lead.
  const sources = new Set();
  let decoder = null;
  let stopped = false;
  // Where in the context's clock the next block goes. Zero means nothing has
  // been scheduled yet and the preroll below is still filling.
  let cursor = 0;
  let held = [];
  let heldSeconds = 0;
  // Set while a gap is being climbed out of. A media element says "playing"
  // again by itself once it has caught up; here the moment the sound comes back
  // is a time on the context's clock, and this is the wait for it.
  let resuming = 0;

  function say(status) {
    if (!stopped) onStatus(status);
  }

  function schedule(block) {
    const { channelData, samplesDecoded, sampleRate } = block;
    const buffer = context.createBuffer(channelData.length, samplesDecoded, sampleRate);
    for (let channel = 0; channel < channelData.length; channel += 1) {
      buffer.copyToChannel(channelData[channel].subarray(0, samplesDecoded), channel);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    // Behind the clock: everything bought has already been heard, and a block
    // started in the past is a block dropped without a sound. Come back in just
    // ahead of now, and say the set is tuning — a gap is what the listener has
    // this moment heard, and it is the same event an element calls "waiting".
    if (cursor < context.currentTime) {
      cursor = context.currentTime + LEAD_S;
      say("tuning");
      // And back on once this block is actually under the needle. Without this
      // the set would be left saying it is tuning for the rest of the station:
      // there is no second event to say the hole has been climbed out of, only
      // the moment the next block was scheduled to start.
      clearTimeout(resuming);
      resuming = setTimeout(() => say("on"), LEAD_S * 1000);
    }
    source.start(cursor);
    cursor += buffer.duration;
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
    };
  }

  // Blocks are held until there is a cushion of them, then scheduled and, from
  // there on, passed straight through. The cushion is the difference between a
  // stream that plays and one that stutters from the first bar: a decoder hands
  // back a block the moment it has one, which is long before the network has
  // settled into the rhythm of the stream.
  function take(block) {
    if (cursor > 0) return schedule(block);
    held.push(block);
    heldSeconds += block.samplesDecoded / block.sampleRate;
    if (heldSeconds < PREROLL_S) return;
    cursor = context.currentTime + LEAD_S;
    for (const waiting of held) schedule(waiting);
    held = [];
    say("on");
  }

  async function run() {
    let response;
    try {
      // `credentials: "omit"` for the reason every other request in lo carries
      // it (see api.js): nothing ambient authenticates anything here. The
      // address is signed, which is the whole of what the proxy checks.
      response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    } catch {
      return say("dead");
    }
    if (stopped) return;
    if (!response.ok || !response.body) return say("dead");
    const wanted = decoderFor(response.headers.get("content-type") || "");
    if (!wanted) {
      controller.abort();
      if (!stopped) onUnsupported();
      return;
    }

    try {
      const Decoder = await wanted;
      if (stopped) return;
      decoder = new Decoder();
      await decoder.ready;
    } catch {
      // The decoder is the enhancement here, not the station: a browser that
      // will not compile it can still play this mount the ordinary way.
      controller.abort();
      if (!stopped) onUnsupported();
      return;
    }
    // Stopped while the Web Assembly was compiling. Nothing to free here: the
    // instance was already on `decoder` when stop ran, and freeing it twice is
    // one of the few things that can actually take a Wasm module down.
    if (stopped) return;

    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (stopped) return;
        // A radio stream has no end; one that reaches one was not a station.
        // Said exactly as the media element's `ended` is said next door.
        if (done) return say("dead");
        // Chunk boundaries are the network's, not the music's — the decoder
        // keeps the remainder of a half-read frame and picks it up on the next
        // call, which is the whole reason a streaming decoder is needed here
        // rather than decodeAudioData over the same bytes. Awaited because one
        // of the two answers synchronously and the other does not, and the read
        // loop has no reason to know which it is holding.
        const block = await decoder.decode(value);
        if (stopped) return;
        if (block.samplesDecoded > 0) take(block);
      }
    } catch {
      if (!stopped) say("dead");
    }
  }

  run();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(resuming);
      controller.abort();
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already finished, and stopping a finished source is not an error
          // worth having an opinion about.
        }
        source.disconnect();
      }
      sources.clear();
      held = [];
      // Freed rather than reset: a station is retuned by opening the next one,
      // and the Web Assembly instance behind this one has nothing left to say.
      try {
        decoder?.free();
      } catch {
        // An instance that never finished compiling has nothing to free, and
        // says so by throwing. Either way it is on its way to the collector.
      }
      decoder = null;
    },
  };
}
