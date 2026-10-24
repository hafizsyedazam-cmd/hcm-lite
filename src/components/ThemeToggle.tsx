"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";

export const THEME_SCRIPT = `try{var t=localStorage.getItem('hcm-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-bs-theme','dark')}}catch(e){}`;

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the theme the inline script applied
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    const obs = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle() {
  const theme = useTheme();
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    if (next === "dark") {
      root.setAttribute("data-theme", "dark");
      root.setAttribute("data-bs-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
      root.removeAttribute("data-bs-theme");
    }
    try {
      localStorage.setItem("hcm-theme", next);
    } catch {}
  };
  return (
    <button className="icon-btn" onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle dark mode">
      {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}
