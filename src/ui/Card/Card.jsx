import { createContext, useContext, useEffect, useRef, useState } from "react";
import styles from "./card.module.css";

// What counts as two presses rather than one. The gap is the browser's own
// double-click interval as near as anyone states it; the slop is how far a single
// press may travel and still be a press rather than the start of a drag. Where the
// second press lands relative to the first is not measured — the heading is a
// narrow strip and its coordinates are not to be trusted inside a WebView (see
// pressUp).
const TAP_GAP = 400;
const TAP_SLOP = 10;
const CYCLE_DURATION = 560;
const CYCLE_MIDPOINT = CYCLE_DURATION / 2;

// Which card of a set of tiles this one is, said by whatever laid them out rather
// than by each tile about itself — the dashboard grid is the only thing that deals
// in sets of them, and the ids are its own (see HomePage and utils/cards.js). What
// it is for is the drag: a heading held for half a second has to be answered for
// with the name of the card it belongs to, and the tile under the finger with the
// name of the one whose place it would take.
//
// Read here and by the mark button, which is a tile without being a card.
// Anywhere else it is null and the tile says nothing: a card standing on a page
// rather than in a set is not one of anything to be ordered.
export const TileId = createContext(null);

// The one box every dashboard component sits in: a title on the left, whatever
// the card wants to say about itself on the right, a line under both, and the
// content below. `square` is what makes the dashboard a grid of equal tiles; the
// card is also a container, so the content inside can size itself to the tile it
// landed in rather than to the window.
//
// The line under the title is not optional. Two cards used to be able to soften
// it or leave it out — the clock and the weather, whose contents read as one
// column under the heading anyway, and the map, where full ink looked like a
// second frame drawn inside the card's own. Each was right about its own tile
// and wrong about the page: read down a grid of them, the cards without the line
// were the ones that looked unfinished.
//
// `back` is the other thing that can be written on a card: give it one and the
// card has two sides, turned over by a double-click on the heading. The heading
// itself goes round with it — a card seen from behind is still the same card, and
// the way back is the same two presses that got you here.
//
// Which side it is dealt showing is `defaultFlipped`, and `onFlip` is how the
// card says it has been turned. Default rather than controlled, in the sense
// React gives a field's defaultValue: the turning belongs to this box, because a
// turn is an animation and an animation has a direction, and a side handed in
// from outside would be a card arriving already turned with no way round. So the
// caller says where it starts and is told where it got to; what it does with that
// — remembering it past the life of the tile, or nothing at all — is its own.
export default function Card({
  title,
  meta,
  action,
  back,
  flipHint,
  cycleHint,
  defaultFlipped = false,
  onFlip,
  onCycle,
  square = false,
  half = false,
  tall = false,
  wide = false,
  flush = false,
  className,
  children,
}) {
  // The side the card was dealt, taken once and not read again: after this the
  // turning is the card's own, and the same answer coming back through the prop —
  // the caller having written down what onFlip just told it — must not be read as
  // the card being turned a second time.
  const [dealt] = useState(defaultFlipped);
  // How many times it has been turned over since. Counted rather than held as a
  // yes or no because the turn is an animation and an animation has a direction: a
  // card standing as it was dealt is resting rather than mid-way through coming
  // back, and it must not play a turn the moment it mounts.
  const [turns, setTurns] = useState(0);
  // Whether a turn is actually under way, which is not the same question as
  // which side is up and is why it is asked separately. The frames are only on
  // the pane while it is being turned: a card left holding the last frame of a
  // finished animation plays it again the moment the tile is drawn again after
  // not being drawn at all — expanding the map takes every other tile off the
  // page with display:none (see .home-main-map in styles.css), and an element
  // that comes back from that comes back with its animations restarted. What
  // the reader saw was the clock turning itself over on the way back from a
  // full-screen map. Where the card rests is a rule and not a frame (see
  // .flipped .pane in card.module.css), so letting go of the animation moves
  // nothing.
  const [turning, setTurning] = useState(false);
  const [cycling, setCycling] = useState(false);
  const flipped = (turns + (dealt ? 1 : 0)) % 2 === 1;
  // The first of a pair of taps, where it landed and when — and the place the
  // finger in hand went down, which is what tells a tap from the start of a drag.
  // The last turn a finger made is remembered for as long as it takes a browser
  // to decide the same two taps were a double-click and say so a second time.
  const tapRef = useRef({ at: 0, x: 0, y: 0 });
  const downRef = useRef(null);
  const turnedAtRef = useRef(0);
  const cycleTimersRef = useRef([]);
  const turnable = Boolean(back || onCycle);

  function clearCycleTimers() {
    cycleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    cycleTimersRef.current = [];
  }

  useEffect(() => clearCycleTimers, []);

  function turn() {
    // A two-sided card changes sides immediately and lets the pane animation
    // reveal the one now facing the reader. A cycling card has one live surface
    // — the map canvas — so its content changes at the invisible, edge-on frame
    // halfway through the same length of turn.
    if (!back && onCycle && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCycle();
      return;
    }
    setTurns((count) => count + 1);
    if (back) {
      setTurning(true);
      onFlip?.(!flipped);
      return;
    }
    if (!onCycle) return;
    clearCycleTimers();
    setCycling(true);
    cycleTimersRef.current = [
      window.setTimeout(onCycle, CYCLE_MIDPOINT),
      window.setTimeout(() => {
        setCycling(false);
        cycleTimersRef.current = [];
      }, CYCLE_DURATION),
    ];
  }

  // Two presses on the heading, counted from the pointer itself rather than
  // waited for as a dblclick. Every kind of press is read the one way here — a
  // finger, a mouse, a pen, and whatever a host forwards into the frame — because
  // the families they arrive in are not all delivered everywhere. iOS raises
  // dblclick only for gestures it has decided are not a zoom, a pan or a
  // selection, and on a heading that is also a handle — held it lifts the card,
  // dragged it turns the page (see HomePage) — it does not raise it at all. lo
  // also runs inside the Even Hub WebView as a frame (see utils/host.js), which
  // forwards the reader's presses as pointer events with no dblclick, and often
  // no touch events, behind them. Pointer events are the one family every one of
  // these speaks, so the two taps are counted off pointerup and nothing else,
  // which is the same gesture the dashboard reads to turn its pages.
  function pressDown(event) {
    if (!event.isPrimary) return;
    downRef.current = { x: event.clientX, y: event.clientY };
  }

  function pressUp(event) {
    const down = downRef.current;
    downRef.current = null;
    if (!event.isPrimary || event.target.closest("button")) return;
    // A press that travelled is a drag: the page is being turned under it, or the
    // list behind it scrolled, and neither is half of a double press. Judged only
    // where the matching down was seen — a lone up, in a frame that dropped its
    // down, is still counted rather than thrown away.
    if (down && Math.abs(event.clientX - down.x) > TAP_SLOP) return;
    if (down && Math.abs(event.clientY - down.y) > TAP_SLOP) return;
    // Already answered — a device that also raises dblclick, or a family delivered
    // alongside this one, turned the card a moment ago on this very gesture.
    if (Date.now() - turnedAtRef.current <= TAP_GAP + TAP_GAP) return;
    // Paired on time alone. Where the two presses landed is not asked: the heading
    // is a 30px strip, so two presses on it inside the interval are the gesture
    // whatever the pixels say — and the pixels lie in the Even Hub WebView, whose
    // forwarded pointers jitter far enough between one press and the next to fail
    // a "near" test that a mouse would pass, which is why the card used to turn
    // only once every few presses rather than every second one.
    const at = Date.now();
    if (at - tapRef.current.at <= TAP_GAP) {
      tapRef.current = { at: 0, x: 0, y: 0 };
      turnedAtRef.current = at;
      turn();
    } else {
      // The first of a pair, or a single press that will turn out to be nothing.
      tapRef.current = { at, x: event.clientX, y: event.clientY };
    }
  }

  const classes = [
    styles.card,
    square ? styles.square : "",
    half ? styles.half : "",
    tall ? styles.tall : "",
    wide ? styles.wide : "",
    back ? styles.flip : "",
    back && flipped ? styles.flipped : "",
    onCycle && cycling ? (turns % 2 === 1 ? styles.cycleTurnA : styles.cycleTurnB) : "",
    className,
  ];
  const tile = useContext(TileId);

  // Written once and placed on both faces — a React element is a description of a
  // heading, and the same description can stand in two places.
  const head = (
    <header
      className={styles.head}
      title={turnable ? (back ? flipHint : cycleHint) : undefined}
      // The heading is already the card's handle: held for half a second it picks
      // the card up, and dragged it turns the page (see HomePage). Two quick
      // presses are neither — the second is well inside the half-second the hold
      // wants, and neither of them travels — so the one strip carries all three.
      // The buttons standing in it keep their own presses.
      //
      // Every press is read off the pointer family (see pressUp): a finger, a
      // mouse, a pen, and whatever the Even Hub WebView forwards into the frame
      // all raise these, where dblclick and the touch events do not always.
      onPointerDown={turnable ? pressDown : undefined}
      onPointerUp={turnable ? pressUp : undefined}
      onPointerCancel={
        turnable
          ? () => {
              downRef.current = null;
            }
          : undefined
      }
    >
      <h2 className={styles.title}>{title}</h2>
      {/* What the card says about itself and whatever it gives the reader to
          press are one group at the right end, rather than two things each
          asked to find their own way there: sent right on their own they split
          the free space between them and the meta line ends up stranded in the
          middle of the heading. */}
      {(meta != null || action) && (
        <span className={styles.tail}>
          {meta != null && <span className={styles.meta}>{meta}</span>}
          {action}
        </span>
      )}
    </header>
  );

  return (
    <section className={classes.filter(Boolean).join(" ")} data-card={tile ?? undefined}>
      {back ? (
        // Nothing to play on the first render — the card is standing as it was
        // dealt, not arriving from the other side. After that each turn is the one
        // set of frames, run forwards or in reverse (see card.module.css), and the
        // two names alternate, which is what makes a turn taken mid-turn start again.
        //
        // And nothing to play once a turn is over either: the frames come off the
        // pane the moment the browser says they have finished, and what holds the
        // card the way round it now is is the resting rule rather than the last
        // frame of an animation (see `turning` above). Only the pane's own turn is
        // listened for — an animation belonging to anything inside the card
        // bubbles through here as well, and it is not this one.
        <div
          className={`${styles.pane} ${turning ? (flipped ? styles.toBack : styles.toFront) : ""}`.trim()}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setTurning(false);
          }}
        >
          {/* The face turned away is taken off the page as well as out of the
              picture: inert is what keeps the heading behind the card from being
              a second handle under the finger, and its contents from being read
              out a second time to anyone listening rather than looking. */}
          <div className={styles.face} inert={flipped}>
            {head}
            <div className={flush ? styles.flush : styles.body}>{children}</div>
          </div>
          <div className={`${styles.face} ${styles.rear}`} inert={!flipped}>
            {head}
            <div className={styles.body}>{back}</div>
          </div>
        </div>
      ) : (
        <>
          {head}
          <div className={flush ? styles.flush : styles.body}>{children}</div>
        </>
      )}
    </section>
  );
}
