import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider, LocationProvider } from "./components/index.js";
import { RouterProvider, Toast } from "./ui/index.js";
// 400 is what the two big figures on the dashboard are set in — at 44px the
// bold cut reads as heavy, and `font-synthesis: none` means the weight has to
// actually be on the page rather than faked down from 600.
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "./i18n/index.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider>
      <AuthProvider>
        <LocationProvider>
          <App />
        </LocationProvider>
      </AuthProvider>
    </RouterProvider>
    <Toast />
  </StrictMode>,
);
