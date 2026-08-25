import { Children, cloneElement } from "react";
import styles from "./action.module.css";

export default function ActionButton({ tooltip, children, type = "button", ...props }) {
  const icon = Children.only(children);
  // Most of these carry a drawn icon, which wants stroking and a fixed box. A
  // few carry a letter instead — the map's pins are letters, so the button that
  // opens what they stand for is one too — and a letter wants a typeface.
  const shape = icon.type === "svg" ? styles.icon : styles.glyph;
  return (
    <button
      {...props}
      type={type}
      className={styles.actionButton}
      data-tooltip={tooltip}
      aria-label={props["aria-label"] || tooltip}
    >
      {cloneElement(icon, { className: shape })}
    </button>
  );
}
