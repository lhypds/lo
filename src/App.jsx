import {
  AccountPage,
  AuthPage,
  HomePage,
  Loading,
  MarksPage,
  PostsPage,
  PrivateRoute,
  useAuth,
} from "./components/index.js";
import { Navigate, useLocation } from "./ui/index.js";

export default function App() {
  const { ready } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return <Loading />;

  if (pathname === "/login") return <AuthPage />;
  if (pathname === "/") return <PrivateRoute><HomePage /></PrivateRoute>;
  if (pathname === "/marks") return <PrivateRoute><MarksPage /></PrivateRoute>;
  if (pathname === "/posts") return <PrivateRoute><PostsPage /></PrivateRoute>;
  if (pathname === "/account") return <PrivateRoute><AccountPage /></PrivateRoute>;
  return <Navigate to="/" replace />;
}
