"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeContextValue = {
  isLightMode: boolean;
  setIsLightMode: (light: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isLightMode, setIsLightModeState] = useState(false);

  useEffect(() => {
    setIsLightModeState(localStorage.getItem("theme") === "light");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("light", isLightMode);
  }, [isLightMode]);

  const setIsLightMode = (light: boolean) => {
    setIsLightModeState(light);
    localStorage.setItem("theme", light ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ isLightMode, setIsLightMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
