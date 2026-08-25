import { Children, cloneElement } from "react";
import styles from "./action.module.css";

export default function ActionButton({ tooltip, children, type = "button", ...props }) {
  const icon = Children.only(children);
  return (
    <button
      {...props}
      type={type}
      className={styles.actionButton}
      data-tooltip={tooltip}
      aria-label={props["aria-label"] || tooltip}
    >
      {cloneElement(icon, { className: styles.icon })}
    </button>
  );
}
