import { createContext, useContext, useEffect, useState } from "react";
import i18n from "../../i18n/index.js";
import { showToast, useNavigate } from "../../ui/index.js";
import { tellHost } from "../../utils/host.js";
import { adoptSettings, forgetSettings } from "../../utils/settings.js";
// Imported for the side effect of registering, since nothing on this path reads
// them: every store that keeps one of the reader's answers has to be in the map
// before a session arrives (see utils/settings.js). A store that turns up late is
// handed the account's answer on the way in, so this is not about the adopting —
// it is about the other direction. The first sign-in on an account with no file
// yet offers this browser's answers up as its answers, and a store that had not
// been imported when that went out would have offered nothing.
//
// Which is exactly the case on the login screen: nothing there draws a clock, a
// dashboard or a map, so nothing there would have imported the four stores.
import "../../utils/cards.js";
import "../../utils/lang.js";
import "../../utils/mapstyle.js";
import "../../utils/units.js";
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

// A k=<key> link, which does carry the whole login: the key /api/login hands back
// with the session, standing in for the password so that a device nobody wants to
// type into is one link away from being signed in.
//
// Read from the fragment first and from the query string second, and both work.
// #k= is the one to hand out: the fragment is the half of a URL a browser keeps
// to itself, so a key in it never reaches an access log, whatever a proxy keeps,
// or the Referer header of the first outbound link that gets pressed. ?k= is
// answered anyway because it is the form anyone writes by hand on the first try,
// and a link that silently does nothing is worse than one that logs.
function linkedKey() {
  return (
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("k") ||
    new URLSearchParams(window.location.search).get("k") ||
    ""
  );
}

// The fragment with the key taken out and anything else in it left alone. lo puts
// nothing else there today, but the fragment belongs to the page rather than to
// this, and a hash that is a plain word — #somewhere — is not a key's to empty.
function hashWithoutKey() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (!params.has("k")) return window.location.hash;
  params.delete("k");
  const rest = params.toString();
  return rest ? `#${rest}` : "";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const requested = linkedUsername();
    const key = linkedKey();

    async function start() {
      let signedIn = null;
      try {
        const data = await api.getSession();
        signedIn = data.user;
        // What this account has decided about how lo is shown to it, which came
        // down with the session rather than being asked for after it: the stores
        // have already drawn this page from the copy in localStorage, and this is
        // the answer from whichever device was last used (see utils/settings.js).
        adoptSettings(data.user.username, data.settings);
      } catch {
        // Nobody is signed in here, or the saved session expired or was revoked.
        // Either way the login screen is the answer: a password is not something
        // this browser is holding on anybody's behalf.
      }

      // A key is spent only where there is nothing to spend it on. A link will
      // not sign anybody out of a session this browser is already holding, the
      // same way a name in one never did — arriving on a phone signed in as
      // somebody else and being quietly turned into a different person is worse
      // than being left where the link put you.
      if (!signedIn && key) {
        try {
          const data = await api.loginWithKey(key);
          signedIn = data.user;
          localStorage.setItem(storageKey, data.user.username);
          adoptSettings(data.user.username, data.settings);
        } catch {
          // A key that was withdrawn, or replaced by a newer link. Said out loud
          // rather than swallowed: the login screen on its own looks like a link
          // that did nothing, and the reader has to know to go and get another.
          if (!cancelled) showToast(i18n.t("auth.linkDead"), 2400);
        }
      }

      if (cancelled) return;
      setUser(signedIn);
      setReady(true);
      if (!requested && !key) return;

      // Both have done their job the moment they have been read, so both come
      // back out of the URL. The name because a bookmark or a shared link should
      // not keep handing an account's name out, and a reload should not undo a
      // sign-out; the key because it is a password, and a password has no
      // business sitting in the address bar of a phone somebody hands round.
      const url = new URL(window.location.href);
      url.searchParams.delete("user");
      url.searchParams.delete("k");
      url.hash = hashWithoutKey();
      if (signedIn) {
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
      } else if (requested) {
        navigate(`/login?username=${encodeURIComponent(requested)}`, { replace: true });
      } else {
        // A key that opens nothing and no name to fall back on. The login screen,
        // with the dead key stripped off the URL behind it so that a reload is
        // one screen rather than the same failure a second time.
        navigate("/login", { replace: true });
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
    adoptSettings(data.user.username, data.settings);
    setUser(data.user);
    return data.user;
  }

  // A brand-new account has no file to adopt, and adoptSettings knows what to do
  // about that: this browser's answers go up as the account's, so the reader's
  // second device starts where their first one left off rather than at defaults.
  async function register(username, password) {
    const data = await api.createUser(username, password);
    localStorage.setItem(storageKey, data.user.username);
    adoptSettings(data.user.username, data.settings);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await api.logout().catch(() => {});
    localStorage.removeItem(storageKey);
    // Nothing further is written against a session that has ended. The page keeps
    // the shape it is in — signing out is not a request for a different dashboard.
    forgetSettings();
    setUser(null);
    // The host is holding a session of its own, minted at the same sign-in against
    // the same account, and nothing about this one ending reaches it (see
    // utils/host.js) — left to itself it would go on feeding a pair of glasses
    // from a phone that has signed out.
    //
    // Last, and after the request rather than before it: a host that hears this
    // takes the frame down, and taking it down mid-request would leave the
    // session on the server that this was asking it to forget.
    tellHost("logout");
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
