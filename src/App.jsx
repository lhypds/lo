import { Loading, PrivateRoute, useAuth } from "./components/index.js";
import { AuthPage, HomePage, MarksPage, PostsPage, UserPage } from "./pages/index.js";
import { Navigate, useLocation } from "./ui/index.js";

// A person is the one thing lo puts a name in a path for: /u/<name>, for who
// somebody is. The name is the whole address of an account here, so it is also
// the whole of the URL after the prefix — and that page has to be linkable for
// anything else to be able to lead to it.
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

  const name = nameAfter(pathname, "/u/");
  if (name) return <PrivateRoute><UserPage username={name} /></PrivateRoute>;

  return <Navigate to="/" replace />;
}
