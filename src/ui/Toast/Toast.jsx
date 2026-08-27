import { useEffect, useRef, useState } from "react";
import styles from "./toast.module.css";
import { register } from "./toastApi";

const POSITION_STYLES = {
  top: { top: 24, bottom: "auto" },
  center: { top: "50%", bottom: "auto", transform: "translate(-50%, -50%)" },
  // The dashboard raises this token above its page dots; other pages keep the
  // original 24px placement, now with the device safe area included.
  bottom: {
    bottom: "var(--toast-bottom, calc(24px + env(safe-area-inset-bottom)))",
    top: "auto",
  },
};

const Toast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState("bottom");
  const timerRef = useRef(null);

  useEffect(() => {
    return register(
      (content, duration, pos = "bottom") => {
        setMessage(content);
        setPosition(pos);
        setVisible(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (duration != null) {
          timerRef.current = setTimeout(() => setVisible(false), duration);
        }
      },
      () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
      }
    );
  }, []);

  if (!visible) return null;
  return <div className={styles.toast} style={POSITION_STYLES[position]}>{message}</div>;
};

export default Toast;
