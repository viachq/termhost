import { useState, useEffect, useCallback, useRef } from "react";
import { useFileBrowserStore } from "../../store/fileBrowserStore";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { listDir, openFolder, writeTerminal } from "../../hooks/useTauriIpc";
import { useTerminalStore } from "../../store/terminalStore";
import { getFileIcon, FILE_ICON_SVG } from "../../constants/fileIcons";
import type { FileEntry } from "../../types";
import s from "./Panels.module.css";

export default function FilesPanel() {
  const currentPath = useFileBrowserStore((st) => st.currentBrowsePath);
  const setCurrentPath = useFileBrowserStore((st) => st.setCurrentBrowsePath);
  const detectedDrives = useFileBrowserStore((st) => st.detectedDrives);
  const detectDrives = useFileBrowserStore((st) => st.detectDrives);
  const homeDir = useWorkspaceStore((st) => st.homeDir);
  const openFile = useFileViewerStore((st) => st.openFile);

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filter, setFilter] = useState("");
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectDrives();
  }, [detectDrives]);

  useEffect(() => {
    const path = currentPath || homeDir || "C:\\";
    if (!currentPath && path) {
      setCurrentPath(path);
    }
  }, [currentPath, homeDir, setCurrentPath]);

  useEffect(() => {
    if (!currentPath) return;
    loadDir(currentPath);
  }, [currentPath]);

  const loadDir = useCallback(async (path: string) => {
    try {
      const result = await listDir(path);
      setEntries(result);
      setFilter("");
    } catch (e) {
      console.error("Failed to list dir:", e);
    }
  }, []);

  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPath(path);
    },
    [setCurrentPath]
  );

  const handleFileClick = useCallback(
    async (entry: FileEntry) => {
      if (entry.is_dir) {
        navigateTo(entry.path);
      } else {
        openFile(entry.path);
      }
    },
    [navigateTo, openFile]
  );

  const parentPath = currentPath ? currentPath.replace(/\\[^\\]+$/, "") || "C:\\" : null;
  const showParent = parentPath && parentPath !== currentPath;

  const parts = currentPath ? currentPath.split("\\").filter(Boolean) : [];

  useEffect(() => {
    if (breadcrumbRef.current) {
      breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth;
    }
  }, [currentPath]);

  const filtered = filter
    ? entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className={s.filesPanel}>
      <div className={s.filesPanelHeader}>
        <input
          className={s.filesSearch}
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
        />
        <button
          className={s.headerBtn}
          title="Open in Terminal"
          onClick={() => {
            const id = useTerminalStore.getState().focusedTerminalId;
            if (id && currentPath) {
              writeTerminal(id, `cd "${currentPath}"\r`);
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 9a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 016 9zM3.854 4.146a.5.5 0 10-.708.708L5.293 7l-2.147 2.146a.5.5 0 00.708.708l2.5-2.5a.5.5 0 000-.708l-2.5-2.5z"/>
            <path d="M2 1a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V3a2 2 0 00-2-2H2z"/>
          </svg>
        </button>
        <button
          className={s.headerBtn}
          title="Open in Explorer"
          onClick={() => { if (currentPath) openFolder(currentPath); }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
          </svg>
        </button>
      </div>

      {detectedDrives.length > 1 && (
        <div className={s.driveBar}>
          {detectedDrives.map((d) => (
            <button
              key={d}
              className={
                currentPath.toUpperCase().startsWith(d.toUpperCase())
                  ? s.driveBtnActive
                  : s.driveBtn
              }
              onClick={() => navigateTo(`${d}\\`)}
            >
              {d}\
            </button>
          ))}
        </div>
      )}

      <div className={s.breadcrumb} ref={breadcrumbRef}>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className={s.breadcrumbSep}>›</span>}
            <span
              className={`${s.breadcrumbSeg} ${i === parts.length - 1 ? s.breadcrumbCurrent : ""}`}
              onClick={
                i < parts.length - 1
                  ? () => navigateTo(parts.slice(0, i + 1).join("\\"))
                  : undefined
              }
            >
              {part}
            </span>
          </span>
        ))}
      </div>

      <div className={s.fileTree}>
        {showParent && (
          <div className={s.fileItemDir} onClick={() => navigateTo(parentPath)}>
            <span
              className={s.fileIcon}
              style={{ color: "#6a6a6a" }}
              dangerouslySetInnerHTML={{ __html: FILE_ICON_SVG.up }}
            />
            <span className={s.fileName}>..</span>
          </div>
        )}
        {filtered.map((entry) => {
          const icon = getFileIcon(entry.name, entry.is_dir);
          return (
            <div
              key={entry.path}
              className={entry.is_dir ? s.fileItemDir : s.fileItem}
              onClick={() => handleFileClick(entry)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", entry.path);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <span
                className={s.fileIcon}
                style={{ color: icon.color }}
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
              <span className={s.fileName}>{entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
