import { createContext, useCallback, useContext, useEffect, useState } from "react";
import i18n from "../../i18n/index.js";
import { showToast, useNavigate } from "../../ui/index.js";
import { tellHost } from "../../utils/host.js";
import { stopRadio } from "../../utils/radio.js";
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
const accountKey = "lo:account";
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

// The account the last answered session check came back with. Not a credential —
// the token in api.js is the whole of what authenticates anything, and this is
// only the name and profile that came down beside it — and kept for one thing: a
// load that could not reach the server has an account to draw rather than a login
// screen it has no business showing (see start below).
function rememberAccount(user) {
  try {
    localStorage.setItem(accountKey, JSON.stringify(user));
  } catch {
    // Storage denied, as a partitioned or private frame is allowed to. The
    // session still lasts as long as the page is open; only the reading of it
    // from behind a dead connection is lost.
  }
}

function rememberedAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(accountKey) || "null");
    return typeof account?.username === "string" ? account : null;
  } catch {
    return null;
  }
}

function forgetAccount() {
  try {
    localStorage.removeItem(accountKey);
  } catch {
    // Nothing was kept, so there is nothing to clear.
  }
}

// The one answer that means nobody is signed in: the server saying it does not
// know this token — it aged out, it was revoked, or there was never one. api.js
// has thrown the copy away by the time this is asked.
//
// Everything else a failed request can be is not that. A refused connection while
// the server is coming back up, a proxy answering 502 in front of it, a phone
// whose network is not up yet, a read that ran out its thirty seconds: in every
// one of those the token is untouched and as good as it was a moment ago. The
// question simply went unasked, and a question that went unasked is not a
// sign-out.
function signedOut(error) {
  return error?.status === 401;
}

// So it is asked again before it is believed. A restart takes the server down and
// brings it up in one breath (see restart.sh), and a page reloaded into that gap
// gets a refused connection rather than an answer. Two seconds of the loading
// screen is a cheaper thing to spend than a sign-out, and a 401 skips all of it —
// a browser with no session waits for nothing.
const RETRY_DELAYS = [500, 1500];

async function askSession() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.getSession();
    } catch (error) {
      if (signedOut(error) || attempt >= RETRY_DELAYS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }
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
      // Whether the session below is one the server confirmed or one taken on
      // trust from the last load, which is the difference between a URL that has
      // done its work and one that has not (see the foot of this).
      let unverified = false;
      try {
        const data = await askSession();
        signedIn = data.user;
        rememberAccount(data.user);
        // What this account has decided about how lo is shown to it, which came
        // down with the session rather than being asked for after it: the stores
        // have already drawn this page from the copy in localStorage, and this is
        // the answer from whichever device was last used (see utils/settings.js).
        adoptSettings(data.user.username, data.settings);
      } catch (error) {
        if (signedOut(error)) {
          // Nobody is signed in here, or the saved session expired or was
          // revoked. Either way the login screen is the answer: a password is not
          // something this browser is holding on anybody's behalf.
          forgetAccount();
        } else {
          // The server was never reached to be asked. The session stands, and the
          // page is drawn from the account this browser last saw — sending a
          // reader to a login screen over a connection error would be sending
          // them to a screen that cannot log anybody in either, and the token
          // they still hold would have opened the page as soon as the line came
          // back.
          //
          // Settings are deliberately left alone here. adoptSettings with nothing
          // to adopt reads as "this account has never saved any" and offers this
          // browser's up as the account's, which against a server that is merely
          // late would put defaults over the real file (see utils/settings.js).
          // The stores are already showing what this browser last held, which is
          // the right answer in any case; what this session decides is kept here
          // and reaches the account at the next load that gets through.
          signedIn = api.hasSession() ? rememberedAccount() : null;
          unverified = Boolean(signedIn);
        }
      }

      // A key is spent only where there is nothing to spend it on. A link will
      // not sign anybody out of a session this browser is already holding, the
      // same way a name in one never did — arriving on a phone signed in as
      // somebody else and being quietly turned into a different person is worse
      // than being left where the link put you.
      let keyUnanswered = false;
      if (!signedIn && key) {
        try {
          const data = await api.loginWithKey(key);
          signedIn = data.user;
          localStorage.setItem(storageKey, data.user.username);
          rememberAccount(data.user);
          adoptSettings(data.user.username, data.settings);
        } catch (error) {
          // A key that was withdrawn, or replaced by a newer link. Said out loud
          // rather than swallowed: the login screen on its own looks like a link
          // that did nothing, and the reader has to know to go and get another.
          //
          // Unless nothing answered, which is a different thing to say: the key is
          // as good as it was, and what the reader has to know is to try it again
          // rather than to go and ask for another one.
          keyUnanswered = !signedOut(error);
          if (!cancelled) {
            showToast(i18n.t(keyUnanswered ? "auth.linkUnreachable" : "auth.linkDead"), 2400);
          }
        }
      }

      if (cancelled) return;
      setUser(signedIn);
      setReady(true);
      if (!requested && !key) return;
      // A key stays in the URL wherever it was not actually spent — nothing
      // answered when it was offered, or it was never offered because a session
      // taken on trust was standing in front of it. Stripping it is what makes a
      // spent key spent, and taking out one that was not would leave the reader
      // on a login screen with the one thing that could have got them past it
      // gone from the address bar. Left where it is, a reload is the whole of
      // trying again.
      if (keyUnanswered || (unverified && key)) return;

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
    rememberAccount(data.user);
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
    rememberAccount(data.user);
    adoptSettings(data.user.username, data.settings);
    setUser(data.user);
    return data.user;
  }

  // The account itself changing under a signed-in session — the profile page
  // saving a bio, or reading back what another device saved. Signing in is what
  // sets the account; this only ever refreshes it, and the kept copy follows so
  // that a load which cannot reach the server draws the profile as it was last
  // saved rather than as it was last signed in with.
  //
  // Its identity has to hold still across renders: a caller watches it (see
  // AccountModal), and one made afresh every time would be an effect that ran
  // every time.
  const updateUser = useCallback((account) => {
    setUser(account);
    rememberAccount(account);
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    localStorage.removeItem(storageKey);
    forgetAccount();
    // Nothing further is written against a session that has ended. The page keeps
    // the shape it is in — signing out is not a request for a different dashboard.
    forgetSettings();
    // The station was playing for the person signing out, and the login screen
    // has nothing to stop it with. Quiet before the screen changes hands: a
    // change of page leaves the radio sounding now (see holdRadioTile), and
    // this is the one that is not a change of page.
    stopRadio();
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
    <AuthContext.Provider value={{ user, ready, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
