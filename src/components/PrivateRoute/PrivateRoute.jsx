import { Navigate } from "../../ui/index.js";
import { useAuth } from "../AuthProvider/index.js";

export default function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}
