import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage: the preference just isn't remembered
  }
}

const CHANGED = "ia-preferences";
const announce = () => window.dispatchEvent(new Event(CHANGED));

/** Re-read a preference when another component changes it. */
function useSynced<T extends string>(key: string, fallback: T, set: (value: T) => void) {
  useEffect(() => {
    const listener = () => set(read(key, fallback));
    window.addEventListener(CHANGED, listener);
    return () => window.removeEventListener(CHANGED, listener);
  }, [key, fallback, set]);
}

const applyTheme = (theme: Theme) => {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => read("ia-theme", "system"));
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);
  useSynced("ia-theme", "system", setThemeState);
  const setTheme = useCallback((value: Theme) => {
    write("ia-theme", value);
    setThemeState(value);
    announce();
  }, []);
  return [theme, setTheme] as const;
}

export function useDensity() {
  const [density, setDensityState] = useState<Density>(() => read("ia-density", "comfortable"));
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
  useSynced("ia-density", "comfortable", setDensityState);
  const setDensity = useCallback((value: Density) => {
    write("ia-density", value);
    setDensityState(value);
    announce();
  }, []);
  return [density, setDensity] as const;
}
