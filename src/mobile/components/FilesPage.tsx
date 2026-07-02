import { useState, useEffect, useCallback } from "react";
import type { DirEntry } from "../types";
import { useMobileStore } from "../store/mobileStore";
import { FilePreview } from "./FilePreview";
import { GitDiffView } from "./GitDiffView";
import { Icon } from "./Icon";
import { apiQuery, apiOrigin } from "../api";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "xml", "yml", "yaml", "toml", "ini", "cfg", "conf",
  "js", "ts", "jsx", "tsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "php", "pl", "lua",
  "c", "h", "cpp", "hpp", "cs", "dart", "scala", "clj",
  "css", "scss", "less", "html", "svg",
  "sh", "bash", "zsh", "ps1", "bat", "cmd",
  "sql", "graphql", "proto",
  "env", "gitignore", "dockerfile", "makefile",
  "log", "diff", "patch",
]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg",
]);

function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return TEXT_EXTENSIONS.has(ext);
}

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : `${dir}\\${name}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString([], {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function listDir(host: string, path: string): Promise<DirEntry[]> {
  const url = `${apiOrigin(host)}/api/dir${apiQuery({ path })}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function readFile(host: string, path: string): Promise<string> {
  const url = `${apiOrigin(host)}/api/file${apiQuery({ path })}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content;
}

async function writeFile(host: string, path: string, content: string): Promise<void> {
  const url = `${apiOrigin(host)}/api/file${apiQuery({ path })}`;
  const res = await fetch(url, { method: "PUT", body: content });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function createEntry(host: string, path: string, isDir: boolean): Promise<void> {
  const url = `${apiOrigin(host)}/api/fs/create${apiQuery({ path, isDir: String(isDir) })}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function renameEntry(host: string, path: string, to: string): Promise<void> {
  const url = `${apiOrigin(host)}/api/fs/rename${apiQuery({ path, to })}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function deleteEntry(host: string, path: string): Promise<void> {
  const url = `${apiOrigin(host)}/api/fs/delete${apiQuery({ path })}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

export interface GitFile { code: string; name: string }

async function gitStatus(host: string, path: string): Promise<{ branch: string; files: GitFile[] } | null> {
  const url = `${apiOrigin(host)}/api/git/status${apiQuery({ path })}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.branch ? data : null;
}

async function gitDiff(host: string, path: string, file: string): Promise<string> {
  const url = `${apiOrigin(host)}/api/git/diff${apiQuery({ path, file })}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.diff;
}

function FileIcon({ entry }: { entry: DirEntry }) {
  const ext = entry.name.split(".").pop()?.toLowerCase();

  if (entry.is_dir) {
    if (/^[A-Za-z]:\\?$/.test(entry.path)) {
      return <span className="fi fi-drive"><Icon name="drive" size={16} /></span>;
    }
    return <span className="fi fi-folder"><Icon name="folder" size={16} /></span>;
  }

  if (ext && ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"].includes(ext)) {
    return <span className="fi fi-image"><Icon name="image" size={16} /></span>;
  }

  if (ext && ["md", "txt", "log"].includes(ext)) {
    return <span className="fi fi-md"><Icon name="edit" size={16} /></span>;
  }

  if (ext && ["sh", "bash", "zsh", "ps1", "bat", "cmd"].includes(ext)) {
    return <span className="fi fi-shell"><Icon name="terminal" size={16} /></span>;
  }

  if (ext && [
    "js", "ts", "jsx", "tsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "swift",
    "c", "h", "cpp", "hpp", "cs", "dart", "scala", "clj", "rb", "php", "pl", "lua",
    "css", "scss", "less", "html", "sql", "graphql", "proto",
    "json", "yml", "yaml", "toml", "ini", "cfg", "conf",
  ].includes(ext)) {
    return <span className="fi fi-code"><Icon name="code" size={16} /></span>;
  }

  return <span className="fi fi-file"><Icon name="document" size={16} /></span>;
}

interface Props {
  onOpenInTerminal: (cwd: string) => void;
}

export function FilesPage({ onOpenInTerminal }: Props) {
  const { host, files, setFilesState, showToast, favoriteDirs, toggleFavoriteDir } = useMobileStore();
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<DirEntry | null>(null);
  const [creating, setCreating] = useState<"file" | "dir" | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingTo, setRenamingTo] = useState<string | null>(null);

  const [infoFor, setInfoFor] = useState<DirEntry | null>(null);
  const [infoCount, setInfoCount] = useState<number | null>(null);

  const openInfo = useCallback((entry: DirEntry) => {
    setMenuFor(null);
    setInfoFor(entry);
    setInfoCount(null);
    // Folders don't carry a size from the listing (would mean a recursive walk
    // on every row) — fetch the item count lazily, only for the one folder
    // someone actually asked to inspect.
    if (entry.is_dir) {
      listDir(host, entry.path).then((es) => setInfoCount(es.length)).catch(() => setInfoCount(null));
    }
  }, [host]);

  const [git, setGit] = useState<{ branch: string; files: GitFile[] } | null>(null);
  const [gitOpen, setGitOpen] = useState(false);
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const dirty = editing && draft !== previewContent;

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("Discard unsaved changes?");
  }, [dirty]);

  const startEdit = useCallback(() => {
    setDraft(previewContent ?? "");
    setEditing(true);
  }, [previewContent]);

  const cancelEdit = useCallback(() => {
    if (!confirmDiscard()) return;
    setEditing(false);
  }, [confirmDiscard]);

  const saveEdit = useCallback(async () => {
    if (!previewPath) return;
    setSaving(true);
    try {
      await writeFile(host, previewPath, draft);
      setPreviewContent(draft);
      setEditing(false);
      showToast("Saved");
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [host, previewPath, draft, showToast]);

  const loadDir = useCallback(async (path: string) => {
    setFilesState({ loading: true, error: null, currentPath: path });
    setGit(null);
    setGitOpen(false);
    try {
      const entries = await listDir(host, path);
      setFilesState({ entries, loading: false });
      if (path) {
        gitStatus(host, path).then(setGit).catch(() => setGit(null));
      }
    } catch (e: any) {
      setFilesState({ error: e.message, loading: false, entries: [] });
    }
  }, [host, setFilesState]);

  // A fresh navigation (opening a folder, jumping to a favorite) invalidates
  // any "redo" path — you took a new direction, the old forward stack no
  // longer describes where you'd land.
  const navigateTo = useCallback((path: string) => {
    const prev = files.currentPath;
    setFilesState({ history: prev ? [...files.history, prev] : files.history, forward: [] });
    setPreviewPath(null);
    setPreviewContent(null);
    setPreviewError(null);
    setSearch("");
    setSearchOpen(false);
    loadDir(path);
  }, [files.currentPath, files.history, loadDir, setFilesState]);

  const navigateBack = useCallback(() => {
    const hist = files.history;
    const cur = files.currentPath;
    const forward = cur ? [cur, ...files.forward] : files.forward;
    if (hist.length === 0) {
      setPreviewPath(null);
      setFilesState({ forward });
      loadDir("");
      return;
    }
    const prev = hist[hist.length - 1];
    setFilesState({ history: hist.slice(0, -1), forward });
    setPreviewPath(null);
    loadDir(prev);
  }, [files.history, files.currentPath, files.forward, loadDir, setFilesState]);

  const navigateForward = useCallback(() => {
    const fwd = files.forward;
    if (fwd.length === 0) return;
    const next = fwd[0];
    const cur = files.currentPath;
    setFilesState({ forward: fwd.slice(1), history: cur ? [...files.history, cur] : files.history });
    setPreviewPath(null);
    loadDir(next);
  }, [files.forward, files.currentPath, files.history, loadDir, setFilesState]);

  const openEntry = useCallback((entry: DirEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
    } else {
      setPreviewPath(entry.path);
      setPreviewContent(null);
      setPreviewError(null);
      setEditing(false);
      setDraft("");

      if (isImageFile(entry.name)) {
        return;
      }

      if (isTextFile(entry.name)) {
        setPreviewLoading(true);
        readFile(host, entry.path)
          .then((content) => {
            setPreviewContent(content);
            setPreviewLoading(false);
          })
          .catch((e) => {
            setPreviewError(e.message);
            setPreviewLoading(false);
          });
      } else {
        setPreviewError("Cannot preview this file type");
      }
    }
  }, [host, navigateTo]);

  const goBack = useCallback(() => {
    if (previewPath) {
      if (!confirmDiscard()) return;
      setPreviewPath(null);
      setPreviewContent(null);
      setPreviewError(null);
      setEditing(false);
      setDraft("");
      return;
    }
    if (gitOpen) {
      if (diffFor) { setDiffFor(null); setDiffText(null); return; }
      setGitOpen(false);
      return;
    }
    if (files.currentPath) {
      navigateBack();
    }
  }, [previewPath, gitOpen, diffFor, files.currentPath, navigateBack, confirmDiscard]);

  const goHome = useCallback(() => {
    if (!confirmDiscard()) return;
    setFilesState({ currentPath: "", entries: [], history: [], forward: [], error: null });
    setPreviewPath(null);
    setPreviewContent(null);
    setPreviewError(null);
    setEditing(false);
    setDraft("");
    loadDir("");
  }, [loadDir, setFilesState, confirmDiscard]);

  useEffect(() => {
    if (host && files.currentPath === "" && files.entries.length === 0 && !files.loading) {
      loadDir("");
    }
  }, [host]);

  useEffect(() => {
    if (host && files.currentPath !== "" && files.entries.length === 0 && !files.loading && !previewPath) {
      loadDir(files.currentPath);
    }
  }, [host, files.currentPath]);

  const openDiff = useCallback((file: string) => {
    setDiffFor(file);
    setDiffText(null);
    setDiffLoading(true);
    gitDiff(host, files.currentPath, file)
      .then(setDiffText)
      .catch((e) => showToast(`Diff failed: ${e.message}`))
      .finally(() => setDiffLoading(false));
  }, [host, files.currentPath, showToast]);

  const submitCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || !creating) return;
    const path = joinPath(files.currentPath, name);
    try {
      await createEntry(host, path, creating === "dir");
      showToast(`Created ${name}`);
      setCreating(null);
      setNewName("");
      loadDir(files.currentPath);
    } catch (e: any) {
      showToast(`Create failed: ${e.message}`);
    }
  }, [host, files.currentPath, newName, creating, loadDir, showToast]);

  const submitRename = useCallback(async () => {
    if (!menuFor || !renamingTo?.trim()) return;
    const to = joinPath(files.currentPath, renamingTo.trim());
    try {
      await renameEntry(host, menuFor.path, to);
      showToast("Renamed");
      setMenuFor(null);
      setRenamingTo(null);
      loadDir(files.currentPath);
    } catch (e: any) {
      showToast(`Rename failed: ${e.message}`);
    }
  }, [host, files.currentPath, menuFor, renamingTo, loadDir, showToast]);

  const doDelete = useCallback(async (entry: DirEntry) => {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    try {
      await deleteEntry(host, entry.path);
      showToast(`Deleted ${entry.name}`);
      setMenuFor(null);
      loadDir(files.currentPath);
    } catch (e: any) {
      showToast(`Delete failed: ${e.message}`);
    }
  }, [host, files.currentPath, loadDir, showToast]);

  // ── Preview / edit screen ──
  if (previewPath) {
    const previewName = previewPath.split("\\").pop()?.split("/").pop() || "";
    const canEdit = isTextFile(previewName) && !previewLoading && !previewError;
    return (
      <div className="m-files">
        <div className="m-files-header">
          <button className="m-files-back" onClick={goBack} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <span className="m-files-title">{previewName}</span>
          {canEdit && !editing && (
            <button className="m-files-edit" onClick={startEdit}>Edit</button>
          )}
          {editing && (
            <>
              <button className="m-files-edit" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className="m-files-edit accent" onClick={saveEdit} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
        <div className="m-files-preview">
          <FilePreview
            host={host}
            path={previewPath}
            content={previewContent}
            loading={previewLoading}
            error={previewError}
            editing={editing}
            draft={draft}
            onDraftChange={setDraft}
          />
        </div>
      </div>
    );
  }

  // ── Git status / diff screen ──
  if (gitOpen && git) {
    if (diffFor) {
      return (
        <div className="m-files">
          <div className="m-files-header">
            <button className="m-files-back" onClick={goBack} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
            <span className="m-files-title">{diffFor}</span>
          </div>
          <div className="m-files-preview">
            <GitDiffView diff={diffText} loading={diffLoading} />
          </div>
        </div>
      );
    }
    return (
      <div className="m-files">
        <div className="m-files-header">
          <button className="m-files-back" onClick={goBack} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <span className="m-files-title">git · {git.branch}</span>
        </div>
        <div className="m-files-list">
          {git.files.length === 0 && <div className="m-files-empty">Clean working tree</div>}
          {git.files.map((f) => (
            <div key={f.name} className="m-files-item" onClick={() => openDiff(f.name)}>
              <span className={`m-git-code m-git-${f.code.trim() || "?"}`}>{f.code.trim() || "?"}</span>
              <span className="m-files-item-name">{f.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Directory listing ──
  const currentName = files.currentPath
    ? files.currentPath.split("\\").pop()?.split("/").pop() || files.currentPath
    : "This PC";

  const visibleEntries = search.trim()
    ? files.entries.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : files.entries;

  const isFavorite = !!files.currentPath && favoriteDirs.includes(files.currentPath);

  return (
    <div className="m-files">
      <div className="m-files-header">
        <button className="m-files-nav" onClick={goBack} disabled={!files.currentPath} aria-label="Back">
          <Icon name="chevronLeft" size={18} />
        </button>
        <button className="m-files-nav" onClick={navigateForward} disabled={files.forward.length === 0} aria-label="Forward">
          <Icon name="chevronRight" size={18} />
        </button>
        <span className="m-files-titles">
          <span className="m-files-title">{currentName}</span>
          {files.currentPath && <span className="m-files-path">{files.currentPath}</span>}
        </span>
        {files.currentPath && (
          <button
            className="m-files-edit"
            onClick={() => toggleFavoriteDir(files.currentPath)}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Icon name={isFavorite ? "starFilled" : "star"} size={15} />
          </button>
        )}
        {files.currentPath && (
          <button className="m-files-edit" onClick={() => setOverflowOpen((v) => !v)} aria-label="More actions">
            <Icon name="more" size={16} />
          </button>
        )}
        <button className="m-files-home" onClick={goHome} aria-label="This PC">
          <Icon name="home" size={16} />
        </button>
      </div>

      {overflowOpen && files.currentPath && (
        <div className="m-files-overflow">
          <button onClick={() => { setOverflowOpen(false); setSearchOpen((v) => !v); }}>
            <Icon name="search" size={15} /> Search this folder
          </button>
          <button onClick={() => { setOverflowOpen(false); setCreating("file"); }}>
            <Icon name="plus" size={15} /> New file or folder
          </button>
          <button onClick={() => { setOverflowOpen(false); onOpenInTerminal(files.currentPath); }}>
            <Icon name="terminal" size={15} /> Open in terminal
          </button>
          {git && (
            <button onClick={() => { setOverflowOpen(false); setGitOpen(true); }}>
              <Icon name="git" size={15} /> Git status
              {git.files.length > 0 && <span className="m-files-overflow-badge">{git.files.length}</span>}
            </button>
          )}
        </div>
      )}

      {searchOpen && (
        <div className="m-files-search">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter this folder…"
          />
        </div>
      )}

      {creating && (
        <div className="m-files-search">
          <div className="m-settings-toggle">
            <button className={creating === "file" ? "active" : ""} onClick={() => setCreating("file")}>File</button>
            <button className={creating === "dir" ? "active" : ""} onClick={() => setCreating("dir")}>Folder</button>
          </div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={creating === "dir" ? "Folder name" : "File name"}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
          />
          <button className="m-files-edit accent" onClick={submitCreate}>Create</button>
          <button className="m-files-edit" onClick={() => { setCreating(null); setNewName(""); }}>Cancel</button>
        </div>
      )}

      {menuFor && (
        <div className="m-files-search">
          {renamingTo === null ? (
            <>
              <span className="m-files-item-name">{menuFor.name}</span>
              <button className="m-files-edit" onClick={() => openInfo(menuFor)}>Info</button>
              <button className="m-files-edit" onClick={() => setRenamingTo(menuFor.name)}>Rename</button>
              <button className="m-files-edit" onClick={() => doDelete(menuFor)}>Delete</button>
              <button className="m-files-edit" onClick={() => setMenuFor(null)}>Close</button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={renamingTo}
                onChange={(e) => setRenamingTo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitRename()}
              />
              <button className="m-files-edit accent" onClick={submitRename}>Save</button>
              <button className="m-files-edit" onClick={() => setRenamingTo(null)}>Cancel</button>
            </>
          )}
        </div>
      )}

      {files.loading && (
        <div className="m-files-loading">Loading...</div>
      )}

      {files.error && (
        <div className="m-files-error">
          <p>{files.error}</p>
          <button onClick={() => loadDir(files.currentPath)}>Retry</button>
        </div>
      )}

      {!files.currentPath && !search && favoriteDirs.length > 0 && (
        <div className="m-files-favorites">
          <div className="m-files-favorites-title">Favorites</div>
          {favoriteDirs.map((path) => (
            <div key={path} className="m-files-item" onClick={() => navigateTo(path)}>
              <span className="fi fi-folder"><Icon name="star" size={16} /></span>
              <span className="m-files-item-main">
                <span className="m-files-item-name">{path.split("\\").pop()?.split("/").pop() || path}</span>
                <span className="m-files-item-sub">{path}</span>
              </span>
              <span
                className="m-files-item-menu"
                onClick={(e) => { e.stopPropagation(); toggleFavoriteDir(path); }}
                role="button"
                aria-label="Remove from favorites"
              >
                <Icon name="close" size={13} />
              </span>
            </div>
          ))}
        </div>
      )}

      {!files.loading && !files.error && (
        <div className="m-files-list">
          {visibleEntries.length === 0 && (
            <div className="m-files-empty">{search ? "No matches" : "Empty directory"}</div>
          )}
          {visibleEntries.map((entry) => {
            const usedPct = entry.total_bytes && entry.free_bytes !== undefined
              ? Math.round(((entry.total_bytes - entry.free_bytes) / entry.total_bytes) * 100)
              : null;
            return (
              <div
                key={entry.path}
                className="m-files-item"
                onClick={() => openEntry(entry)}
              >
                <FileIcon entry={entry} />
                <span className="m-files-item-main">
                  <span className="m-files-item-name">{entry.name}</span>
                  {usedPct !== null && entry.total_bytes && entry.free_bytes !== undefined && (
                    <span className="m-files-item-sub">
                      {formatBytes(entry.free_bytes)} free of {formatBytes(entry.total_bytes)}
                      <span className="m-files-disk-bar"><span style={{ width: `${usedPct}%` }} /></span>
                    </span>
                  )}
                </span>
                <span
                  className="m-files-item-menu"
                  onClick={(e) => { e.stopPropagation(); setMenuFor(entry); setRenamingTo(null); }}
                  role="button"
                  aria-label="More"
                >
                  ⋯
                </span>
              </div>
            );
          })}
        </div>
      )}

      {infoFor && (
        <div className="m-files-info-backdrop" onClick={() => setInfoFor(null)}>
          <div className="m-files-info-card" onClick={(e) => e.stopPropagation()}>
            <div className="m-files-info-title">
              <FileIcon entry={infoFor} />
              {infoFor.name}
            </div>
            <div className="m-files-info-row"><span>Type</span><span>{infoFor.is_dir ? "Folder" : "File"}</span></div>
            {!infoFor.is_dir && infoFor.size !== undefined && (
              <div className="m-files-info-row"><span>Size</span><span>{formatBytes(infoFor.size)}</span></div>
            )}
            {infoFor.is_dir && (
              <div className="m-files-info-row"><span>Items</span><span>{infoCount === null ? "…" : infoCount}</span></div>
            )}
            {infoFor.modified !== undefined && (
              <div className="m-files-info-row"><span>Modified</span><span>{formatDate(infoFor.modified)}</span></div>
            )}
            <div className="m-files-info-row m-files-info-path"><span>Path</span><span>{infoFor.path}</span></div>
            <button className="m-files-edit" onClick={() => setInfoFor(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
