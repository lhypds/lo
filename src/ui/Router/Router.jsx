import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext(null);

function currentLocation() {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to, options = {}) => {
    const target = new URL(to, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.assign(target.href);
      return;
    }
    const next = `${target.pathname}${target.search}${target.hash}`;
    window.history[options.replace ? "replaceState" : "pushState"]({}, "", next);
    setLocation(currentLocation());
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useLocation() {
  return useContext(RouterContext).location;
}

export function useSearchParams() {
  const { search } = useLocation();
  return [useMemo(() => new URLSearchParams(search), [search])];
}

export function Link({ to, onClick, children, ...props }) {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Navigate({ to, replace = false }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}
