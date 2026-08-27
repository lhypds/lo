import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "../../ui/index.js";
import * as api from "../../api.js";

const storageKey = "lo:user";
const AuthContext = createContext(null);

// The last name signed in from this browser. Not a credential and no longer a way
// back in on its own — it is the name the login screen opens with in its field,
// so that coming back after a session has gone is a password to type rather than
// both halves of one.
export function rememberedUsername() {
  return localStorage.getItem(storageKey) || "";
}

// A ?user=<name> link used to carry a whole login, a username being the whole
// credential; there is a password behind it now, so what the link carries is the
// typing. Whoever follows one lands on the login screen with the name filled in
// and the password left to them.
function linkedUsername() {
  const raw = new URLSearchParams(window.location.search).get("user") || "";
  return raw.trim().normalize("NFKC").toLowerCase();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const requested = linkedUsername();

    async function start() {
      let signedIn = null;
      try {
        const data = await api.getSession();
        signedIn = data.user;
      } catch {
        // Nobody is signed in here, or the server restarted and dropped the
        // session it had. Either way the login screen is the answer: a password
        // is not something this browser is holding on anybody's behalf.
      }
      if (cancelled) return;
      setUser(signedIn);
      setReady(true);
      if (!requested) return;

      // The name has done its job the moment it has been read, so it comes back
      // out of the URL — a bookmark or a shared link should not keep handing an
      // account's name out, and a reload should not undo a sign-out.
      const url = new URL(window.location.href);
      url.searchParams.delete("user");
      // A link cannot sign anybody in any more, and it will not sign anybody out
      // either: where this browser is already holding a session, the name is
      // simply dropped and the reader stays where the link put them.
      if (signedIn) {
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
      } else {
        navigate(`/login?username=${encodeURIComponent(requested)}`, { replace: true });
      }
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function login(username, password) {
    const data = await api.login(username, password);
    localStorage.setItem(storageKey, data.user.username);
    setUser(data.user);
    return data.user;
  }

  async function register(username, password) {
    const data = await api.createUser(username, password);
    localStorage.setItem(storageKey, data.user.username);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await api.logout().catch(() => {});
    localStorage.removeItem(storageKey);
    setUser(null);
  }

  return (
    // `updateUser` is for the account itself changing under a signed-in session —
    // the profile page saving a bio, or reading back what another device saved.
    // Signing in is what sets the account; this only ever refreshes it.
    <AuthContext.Provider value={{ user, ready, login, register, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
