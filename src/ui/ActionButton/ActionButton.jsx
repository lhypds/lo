import { Children, cloneElement } from "react";
import styles from "./action.module.css";

export default function ActionButton({
  tooltip,
  // For the buttons that sit against the right edge of something: the tooltip
  // hangs off its own button by default, which is fine in the top bar, is cut
  // off in a list, and runs off the side of a card in a tile's heading.
  tooltipRight = false,
  children,
  href,
  type = "button",
  ...props
}) {
  const icon = Children.only(children);
  // Most of these carry a drawn icon, which wants stroking and a fixed box. A
  // few carry a letter instead — the map's pins are letters, so the button that
  // opens what they stand for is one too — and a letter wants a typeface.
  const shape = icon.type === "svg" ? styles.icon : styles.glyph;
  // An anchor when the press leaves lo altogether. It has to be a real link
  // rather than a button that navigates: a tapped link is what a phone hands to
  // an installed app, and a scripted navigation is what it doesn't.
  const Tag = href ? "a" : "button";
  return (
    <Tag
      {...props}
      {...(href ? { href } : { type })}
      className={tooltipRight ? `${styles.actionButton} ${styles.tooltipRight}` : styles.actionButton}
      data-tooltip={tooltip}
      aria-label={props["aria-label"] || tooltip}
    >
      {cloneElement(icon, { className: shape })}
    </Tag>
  );
}
