import { Loading, PrivateRoute, useAuth } from "./components/index.js";
import { AuthPage, HomePage, MarksPage, PostsPage, UserPage } from "./pages/index.js";
import { Navigate, useLocation } from "./ui/index.js";

// The paths lo keeps for itself, which is the price of the arrangement below:
// each one is matched before a name is read out of the path, and none of them can
// be opened as an account either (see /api/users), because a name this list
// shadows would be a person nothing could link to. "account" is not a page any
// more and is still spoken for — an old link to it belongs on the dashboard.
const RESERVED = new Set(["login", "marks", "posts", "account"]);

// A person is the one thing lo puts a name in a path for: /<name>, for who
// somebody is. The name is the whole address of an account here, so it is the
// whole of the URL too — the root of the site is worth more to a person than to
// lo, which has four pages of its own and no use for a prefix in front of every
// name it hands somebody to send.
function nameIn(pathname) {
  // The name is the whole path. Anything with a second slash in it is not a
  // person, however much it looks like one up to there.
  if (pathname.indexOf("/", 1) !== -1) return "";
  let name;
  try {
    name = decodeURIComponent(pathname.slice(1)).trim().normalize("NFKC").toLowerCase();
  } catch {
    // A path that is not valid percent-encoding names nobody
    return "";
  }
  return RESERVED.has(name) ? "" : name;
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

  const name = nameIn(pathname);
  if (name) return <PrivateRoute><UserPage username={name} /></PrivateRoute>;

  return <Navigate to="/" replace />;
}
