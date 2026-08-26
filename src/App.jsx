import { Loading, PrivateRoute, useAuth } from "./components/index.js";
import { AuthPage, HomePage, MarksPage, MessagesPage, PostsPage, UserPage } from "./pages/index.js";
import { Navigate, useLocation } from "./ui/index.js";

// A person is the one thing lo puts a name in a path for, and it does it twice:
// /u/<name> for who somebody is, /messages/<name> for what the two of you have
// said to each other. The name is the whole address of an account here, so it is
// also the whole of the URL after the prefix — and both of those pages have to
// be linkable for anything else to be able to lead to them.
function nameAfter(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(pathname.slice(prefix.length)).trim().normalize("NFKC").toLowerCase();
  } catch {
    // A path that is not valid percent-encoding names nobody
    return "";
  }
}

export default function App() {
  const { ready } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return <Loading />;

  if (pathname === "/login") return <AuthPage />;
  if (pathname === "/") return <PrivateRoute><HomePage /></PrivateRoute>;
  if (pathname === "/marks") return <PrivateRoute><MarksPage /></PrivateRoute>;
  if (pathname === "/posts") return <PrivateRoute><PostsPage /></PrivateRoute>;
  // Your own account has no route of its own: it is a sheet the top bar opens
  // over whatever page is already there — see AccountModal. /account was a page
  // until it became one, and an old link to it falls through to the dashboard
  // below.

  // The mailbox and one conversation out of it. These are the phone's way into
  // messages — a desktop opens the same conversation as a sheet over the page it
  // is already on, and never comes here unless a link brings it. Which is why
  // the routes are here for everybody rather than behind the same test: a URL
  // that only answers on some screens is not an address.
  if (pathname === "/messages") return <PrivateRoute><MessagesPage /></PrivateRoute>;
  const talkingTo = nameAfter(pathname, "/messages/");
  if (talkingTo) {
    // Keyed on the name, so walking from one conversation to another is a new
    // page rather than the same one with somebody else's words still in it.
    return <PrivateRoute><MessagesPage key={talkingTo} username={talkingTo} /></PrivateRoute>;
  }

  const name = nameAfter(pathname, "/u/");
  if (name) return <PrivateRoute><UserPage username={name} /></PrivateRoute>;

  return <Navigate to="/" replace />;
}
