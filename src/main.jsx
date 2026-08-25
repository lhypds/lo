import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider, LocationProvider } from "./components/index.js";
import { RouterProvider, Toast } from "./ui/index.js";
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
