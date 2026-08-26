import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "../../ui/index.js";
import * as api from "../../api.js";

const storageKey = "lo:user";
const AuthContext = createContext(null);

// A username is the whole credential here, so a ?user=<name> link carries an
// entire login: opening one signs that account in, exactly as typing the name
// on /login would.
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
    const storedUsername = localStorage.getItem(storageKey);
    const requested = linkedUsername();

    // The name has done its job the moment it is signed in, so it comes back
    // out of the URL — a bookmark or a shared link should not keep handing the
    // account out, and a later reload should not undo a sign-out.
    function dropUserParam() {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("user")) return;
      url.searchParams.delete("user");
      navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
    }

    async function restore() {
      try {
        const data = await api.getSession();
        if (!cancelled) setUser(data.user);
      } catch {
        // The server restarted and dropped the session, but the browser still
        // remembers who this is — a username is the whole credential, so
        // signing back in needs nothing more.
        if (storedUsername) {
          try {
            const data = await api.login(storedUsername);
            if (!cancelled) setUser(data.user);
          } catch {
            localStorage.removeItem(storageKey);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    async function start() {
      // The link says who should be signed in, so it wins over whatever
      // session this browser is already holding.
      if (requested) {
        try {
          const data = await api.login(requested);
          if (cancelled) return;
          localStorage.setItem(storageKey, data.user.username);
          setUser(data.user);
          setReady(true);
          dropUserParam();
          return;
        } catch (error) {
          // A name the server refuses is no login at all: fall through to the
          // usual restore, which lands on /login when there is nothing left.
          if (cancelled) return;
          // A link naming an account that does not exist yet gets the same
          // question typing the name would: the login page carries it, ready
          // for the create prompt, rather than creating it on a tap.
          if (error?.code === "USER_NOT_FOUND") {
            navigate(`/login?username=${encodeURIComponent(requested)}`, { replace: true });
          } else {
            dropUserParam();
          }
        }
      }
      await restore();
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function login(username) {
    const data = await api.login(username);
    localStorage.setItem(storageKey, data.user.username);
    setUser(data.user);
    return data.user;
  }

  async function register(username) {
    const data = await api.createUser(username);
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
