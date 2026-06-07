import { create } from "zustand";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { CursorStyle, UiTheme } from "../types";
import { THEMES } from "../constants/themes";

interface SettingsState {
  uiTheme: UiTheme;
  activeThemeKey: string;
  termFontSize: number;
  termFontFamily: string;
  termCursorStyle: CursorStyle;
  uiScale: number;
  splitResizeEnabled: boolean;

  loadSettings: () => void;
  setUiTheme: (theme: UiTheme) => void;
  setActiveThemeKey: (key: string) => void;
  setTermFontSize: (size: number) => void;
  setTermFontFamily: (family: string) => void;
  setTermCursorStyle: (style: CursorStyle) => void;
  setUiScale: (scale: number) => void;
  setSplitResizeEnabled: (enabled: boolean) => void;
  getXtermTheme: () => (typeof THEMES)[string];
}

function save(state: SettingsState) {
  localStorage.setItem("terminalhub-ui-theme", state.uiTheme);
  localStorage.setItem("terminalhub-theme", state.activeThemeKey);
  localStorage.setItem("terminalhub-fontsize", String(state.termFontSize));
  localStorage.setItem("terminalhub-fontfamily", state.termFontFamily);
  localStorage.setItem("terminalhub-cursorstyle", state.termCursorStyle);
  localStorage.setItem("terminalhub-uiscale", String(state.uiScale));
  localStorage.setItem("terminalhub-split-resize", state.splitResizeEnabled ? "1" : "0");
  document.documentElement.setAttribute("data-ui-theme", state.uiTheme);
  getCurrentWebview().setZoom(state.uiScale / 100).catch(() => {});
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiTheme: "dark",
  activeThemeKey: "terminalhub",
  termFontSize: 14,
  termFontFamily: "'Cascadia Mono', 'Consolas', monospace",
  termCursorStyle: "block",
  uiScale: 100,
  splitResizeEnabled: true,

  loadSettings: () => {
    const uiTheme = (localStorage.getItem("terminalhub-ui-theme") || "dark") as UiTheme;
    let activeThemeKey = localStorage.getItem("terminalhub-theme") || "terminalhub";
    if (!THEMES[activeThemeKey]) activeThemeKey = "terminalhub";
    const termFontSize = parseInt(localStorage.getItem("terminalhub-fontsize") || "14");
    const termFontFamily = localStorage.getItem("terminalhub-fontfamily") || "'Cascadia Mono', 'Consolas', monospace";
    const termCursorStyle = (localStorage.getItem("terminalhub-cursorstyle") || "block") as CursorStyle;
    const uiScale = parseInt(localStorage.getItem("terminalhub-uiscale") || "100");
    const splitResizeEnabled = localStorage.getItem("terminalhub-split-resize") !== "0";

    set({ uiTheme, activeThemeKey, termFontSize, termFontFamily, termCursorStyle, uiScale, splitResizeEnabled });
    document.documentElement.setAttribute("data-ui-theme", uiTheme);
    getCurrentWebview().setZoom(uiScale / 100).catch(() => {});
  },

  setUiTheme: (uiTheme) => {
    set({ uiTheme });
    save(get());
  },
  setActiveThemeKey: (activeThemeKey) => {
    set({ activeThemeKey });
    save(get());
  },
  setTermFontSize: (termFontSize) => {
    set({ termFontSize: Math.max(8, Math.min(28, termFontSize)) });
    save(get());
  },
  setTermFontFamily: (termFontFamily) => {
    set({ termFontFamily });
    save(get());
  },
  setTermCursorStyle: (termCursorStyle) => {
    set({ termCursorStyle });
    save(get());
  },
  setUiScale: (uiScale) => {
    set({ uiScale });
    save(get());
  },
  setSplitResizeEnabled: (splitResizeEnabled) => {
    set({ splitResizeEnabled });
    save(get());
  },

  getXtermTheme: () => THEMES[get().activeThemeKey] || THEMES.terminalhub,
}));
