import { Loading, PrivateRoute, useAuth } from "./components/index.js";
import { AuthPage, HomePage, MarksPage, PostsPage, UserPage } from "./pages/index.js";
import { Navigate, useLocation } from "./ui/index.js";

// A person is the one thing lo has a path with a name in it: /u/<name>. The name
// is the whole address of an account here, so it is also the whole of the URL —
// and a profile has to be linkable for the sheet over the dashboard to have a
// page to lead to at all.
function profileName(pathname) {
  if (!pathname.startsWith("/u/")) return "";
  try {
    return decodeURIComponent(pathname.slice(3)).trim().normalize("NFKC").toLowerCase();
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
  // Neither messages nor your own account have a route of their own: they are
  // sheets the top bar opens over whatever page is already there — see
  // MessagesModal and AccountModal. /account was a page until it became one of
  // them, and an old link to it falls through to the dashboard below.

  const name = profileName(pathname);
  if (name) return <PrivateRoute><UserPage username={name} /></PrivateRoute>;

  return <Navigate to="/" replace />;
}
