import { create } from "zustand";
import { listDir } from "../hooks/useTauriIpc";

interface FileBrowserState {
  currentBrowsePath: string;
  detectedDrives: string[];

  setCurrentBrowsePath: (path: string) => void;
  setDetectedDrives: (drives: string[]) => void;
  detectDrives: () => Promise<void>;
}

export const useFileBrowserStore = create<FileBrowserState>((set) => ({
  currentBrowsePath: "",
  detectedDrives: [],

  setCurrentBrowsePath: (currentBrowsePath) => set({ currentBrowsePath }),
  setDetectedDrives: (detectedDrives) => set({ detectedDrives }),

  detectDrives: async () => {
    const drives: string[] = [];
    for (const letter of ["C", "D", "E", "F", "G", "H"]) {
      try {
        await listDir(`${letter}:\\`);
        drives.push(`${letter}:`);
      } catch {
        // drive not available
      }
    }
    set({ detectedDrives: drives });
  },
}));
