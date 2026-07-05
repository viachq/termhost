1|import { useCallback, useRef, useEffect, useState } from "react";
2|import { Terminal } from "@xterm/xterm";
3|import { FitAddon } from "@xterm/addon-fit";
4|import { SearchAddon } from "@xterm/addon-search";
5|import { useMobileStore } from "./store/mobileStore";
6|import { useSocket } from "./hooks/useSocket";
7|import type { ServerMessage } from "./types";
8|import { ConnectScreen } from "./components/ConnectScreen";
9|import { Toolbar } from "./components/Toolbar";
10|import { InputRow } from "./components/InputRow";
11|import { uploadFile } from "./api";
12|import { WorkspacePicker } from "./components/WorkspacePicker";
13|import { ClipboardPage } from "./components/ClipboardPage";
14|import { CustomizeToolbar } from "./components/CustomizeToolbar";
15|import { Toast } from "./components/Toast";
16|import { Home } from "./components/Home";
17|import { Settings } from "./components/Settings";
18|import { FilesPage } from "./components/FilesPage";
19|import { SearchBar } from "./components/SearchBar";
20|import { SnippetBar } from "./components/SnippetBar";
21|import { haptic } from "./haptics";
22|
23|type TermSize = { cols: number; rows: number };
24|
25|export function App() {
26|  const {
27|    connection,
28|    host,
29|    terminals,
30|    activeTerminalId,
31|    showWorkspacePicker,
32|    workspaces,
33|    activeWorkspaceIdx,
34|    setTerminals,
35|    setActiveTerminalId,
36|    setWorkspaces,
37|    setShowWorkspacePicker,
38|    showToast,
39|    fontSize,
40|    theme,
41|    accent,
42|    snippets,
43|  } = useMobileStore();
44|
45|  const [showSearch, setShowSearch] = useState(false);
46|  const searchRegistry = useRef<Map<string, SearchAddon>>(new Map());
47|  const registerSearch = useCallback((id: string, addon: SearchAddon) => {
48|    searchRegistry.current.set(id, addon);
49|  }, []);
50|  const unregisterSearch = useCallback((id: string) => {
51|    searchRegistry.current.delete(id);
52|  }, []);
53|
54|  // Reflect theme/accent prefs onto the document so all screens (Home, Files,
55|  // Settings, the terminal chrome) pick them up via the existing CSS variables.
56|  useEffect(() => {
57|    document.documentElement.dataset.theme = theme;
58|    document.documentElement.style.setProperty("--accent", accent);
59|    document.documentElement.style.setProperty(
60|      "--accent-soft",
61|      accent.length === 7 ? `${accent}1f` : accent
62|    );
63|  }, [theme, accent]);
64|
65|  // "home" = dashboard (workspace chips, terminal cards, quick actions).
66|  // "terminal" = the focused fullscreen terminal + keybar + input dock.
67|  const [view, setView] = useState<"home" | "terminal">("home");
68|  const [showClipboard, setShowClipboard] = useState(false);
69|  const [showFiles, setShowFiles] = useState(false);
70|  const [showSettings, setShowSettings] = useState(false);
71|  const [showCustomizeToolbar, setShowCustomizeToolbar] = useState(false);
72|  const [keysOpen, setKeysOpen] = useState(() => localStorage.getItem("th-keys-open") !== "0");
73|  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});
74|
75|  // Last time each terminal produced output — drives the home screen's "recently
76|  // active" dot so you can see which agent is doing something without opening it.
77|  const lastOutputAt = useRef<Record<string, number>>({});
78|  // Ticks while the home screen is visible so the dot fades out ~8s after output
79|  // stops, even with no new messages arriving to trigger a render.
80|  const [, tick] = useState(0);
81|  useEffect(() => {
82|    if (view !== "home") return;
83|    const t = setInterval(() => tick((v) => v + 1), 2000);
84|    return () => clearInterval(t);
85|  }, [view]);
86|
87|  // A tap on "New terminal" spawns async; once the daemon's next terminal list
88|  // includes an id we haven't seen before, jump straight into it.
89|  const pendingSpawnRef = useRef(false);
90|  const knownIdsRef = useRef<Set<string>>(new Set());
91|
92|  const toggleKeys = useCallback(() => {
93|    setKeysOpen((v) => {
94|      const n = !v;
95|      localStorage.setItem("th-keys-open", n ? "1" : "0");
96|      return n;
97|    });
98|  }, []);
99|
100|  const termRegistry = useRef<Map<string, Terminal>>(new Map());
101|  // Canonical PTY grid per terminal, fed by the daemon (view mode renders to it).
102|  const [sizes, setSizes] = useState<Record<string, TermSize>>({});
103|
104|  const handleMessage = useCallback(
105|    (msg: ServerMessage) => {
106|      switch (msg.type) {
107|        case "terminals": {
108|          if (pendingSpawnRef.current) {
109|            const fresh = msg.data.find((t) => !knownIdsRef.current.has(t.id));
110|            if (fresh) {
111|              setActiveTerminalId(fresh.id);
112|              setView("terminal");
113|              pendingSpawnRef.current = false;
114|            }
115|          }
116|          knownIdsRef.current = new Set(msg.data.map((t) => t.id));
117|
118|          setTerminals(msg.data);
119|          setSizes((prev) => {
120|            const next = { ...prev };
121|            for (const t of msg.data) {
122|              if (t.cols && t.rows) next[t.id] = { cols: t.cols, rows: t.rows };
123|            }
124|            return next;
125|          });
126|          if (msg.data.length > 0) {
127|            const current = useMobileStore.getState().activeTerminalId;
128|            if (!current || !msg.data.find((t) => t.id === current)) {
129|              setActiveTerminalId(msg.data[0].id);
130|            }
131|          }
132|          break;
133|        }
134|        case "output":
135|          lastOutputAt.current[msg.id] = Date.now();
136|          termRegistry.current.get(msg.id)?.write(msg.data);
137|          break;
138|        case "buffer":
139|          termRegistry.current.get(msg.id)?.write(msg.data);
140|          break;
141|        case "screen": {
142|          // Clean current-screen snapshot: reset then paint so a freshly attached
143|          // phone shows the live screen instead of a blank/scrolled-off terminal.
144|          const term = termRegistry.current.get(msg.id);
145|          if (term) {
146|            term.reset();
147|            term.write(msg.data);
148|          }
149|          break;
150|        }
151|        case "resize":
152|          setSizes((prev) => ({ ...prev, [msg.id]: { cols: msg.cols, rows: msg.rows } }));
153|          break;
154|        case "resize_rejected":
155|          setActiveStates((prev) => ({ ...prev, [msg.id]: false }));
156|          break;
157|        case "workspaces":
158|          setWorkspaces(msg.data, msg.activeIdx);
159|          break;
160|        case "clipboard_ok":
161|          showToast(
162|            msg.ok
163|              ? msg.image
164|                ? "Image → PC clipboard · Alt+V in Claude"
165|                : "Copied to PC clipboard"
166|              : "Failed to copy"
167|          );
168|          break;
169|      }
170|    },
171|    [setTerminals, setActiveTerminalId, setWorkspaces, showToast]
172|  );
173|
174|  const { connect, disconnect, send } = useSocket(handleMessage);
175|
176|  const handleConnect = useCallback((host: string) => connect(host), [connect]);
177|
178|  const handleTerminalData = useCallback(
179|    (data: string) => {
180|      const id = useMobileStore.getState().activeTerminalId;
181|      if (id) send({ type: "input", id, data });
182|    },
183|    [send]
184|  );
185|
186|  const handleResize = useCallback(
187|    (id: string, cols: number, rows: number, claim?: boolean) => {
188|      send({ type: "resize", id, cols, rows, claim });
189|    },
190|    [send]
191|  );
192|
193|  const handleSelectTerminal = useCallback(
194|    (id: string) => {
195|      setActiveTerminalId(id);
196|      setView("terminal");
197|    },
198|    [setActiveTerminalId]
199|  );
200|
201|  // Swipe left/right (within the terminal view) cycles to the next/previous
202|  // terminal. Deliberately horizontal-only, with a velocity+distance gate, so
203|  // it doesn't fight xterm's own vertical scroll/selection touch handling.
204|  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
205|  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
206|    const t = e.touches[0];
207|    if (t) swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
208|  }, []);
209|  const handleSwipeEnd = useCallback(
210|    (e: React.TouchEvent) => {
211|      const start = swipeRef.current;
212|      swipeRef.current = null;
213|      if (!start) return;
214|      const t = e.changedTouches[0];
215|      if (!t) return;
216|      const dx = t.clientX - start.x;
217|      const dy = t.clientY - start.y;
218|      const dt = Date.now() - start.t;
219|      if (dt > 500 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
220|      const list = useMobileStore.getState().terminals;
221|      if (list.length < 2) return;
222|      const curId = useMobileStore.getState().activeTerminalId;
223|      const idx = list.findIndex((x) => x.id === curId);
224|      if (idx === -1) return;
225|      const next = dx < 0
226|        ? list[(idx + 1) % list.length]
227|        : list[(idx - 1 + list.length) % list.length];
228|      haptic();
229|      setActiveTerminalId(next.id);
230|    },
231|    [setActiveTerminalId]
232|  );
233|
234|  const handleSwitchWorkspace = useCallback(
235|    (idx: number) => send({ type: "switch_workspace", idx }),
236|    [send]
237|  );
238|
239|  const handleCreateWorkspace = useCallback(
240|    (name: string, color: number) => send({ type: "create_workspace", name, color }),
241|    [send]
242|  );
243|
244|  const handleDeleteWorkspace = useCallback(
245|    (idx: number) => send({ type: "delete_workspace", idx }),
246|    [send]
247|  );
248|
249|  const handleSpawn = useCallback((cwd?: string) => {
250|    pendingSpawnRef.current = true;
251|    send({ type: "spawn", wsIdx: useMobileStore.getState().activeWorkspaceIdx, cwd });
252|  }, [send]);
253|
254|  const handleOpenInTerminal = useCallback((cwd: string) => {
255|    setShowFiles(false);
256|    handleSpawn(cwd);
257|  }, [handleSpawn]);
258|
259|  const handleDeleteTerminal = useCallback(
260|    (id: string) => send({ type: "kill", id }),
261|    [send]
262|  );
263|
264|  // Long-press the home-screen icon → "Quick text" / "New terminal" shortcuts
265|  // (manifest.json `shortcuts`) land here as ?shortcut=... — skip the Home
266|  // dashboard entirely so typing something at 2am is one tap, not three.
267|  const shortcutHandledRef = useRef(false);
268|  useEffect(() => {
269|    if (connection !== "connected" || shortcutHandledRef.current) return;
270|    const shortcut = new URLSearchParams(window.location.search).get("shortcut");
271|    if (!shortcut) return;
272|    shortcutHandledRef.current = true;
273|    if (shortcut === "text") {
274|      setShowClipboard(true);
275|    } else if (shortcut === "new") {
276|      handleSpawn();
277|    }
278|    window.history.replaceState(null, "", window.location.pathname);
279|  }, [connection, handleSpawn]);
280|
281|  const handleClipboard = useCallback(
282|    (data: string) => send({ type: "clipboard", data }),
283|    [send]
284|  );
285|
286|  const handleTypeGlobal = useCallback(
287|    (text: string) => send({ type: "type_global", text }),
288|    [send]
289|  );
290|
291|  const handleKeyGlobal = useCallback(
292|    (key: string) => send({ type: "key_global", key }),
293|    [send]
294|  );
295|
296|  const handleImage = useCallback(
297|    (name: string, data: string) => send({ type: "clipboard_image", name, data }),
298|    [send]
299|  );
300|
301|  const handleUpload = useCallback(
302|    async (file: File) => {
303|      try {
304|        const path = await uploadFile(host, file);
305|        showToast(`Uploaded: ${path}`);
306|        // Auto-inject file path into the active terminal so the AI agent
307|        // sees the reference directly (path injection, not clipboard-only).
308|        const activeId = useMobileStore.getState().activeTerminalId;
309|        if (activeId) {
310|          send({ type: "inject_file", id: activeId, path });
311|        }
312|      } catch (e: any) {
313|        showToast(`Upload failed: ${e.message}`);
314|      }
315|    },
316|    [host, showToast, send]
317|  );
318|
319|  const handleSendToTerminal = useCallback(
320|    (id: string, data: string) => send({ type: "input", id, data }),
321|    [send]
322|  );
323|
324|  const registerTerminal = useCallback(
325|    (id: string, term: Terminal) => {
326|      termRegistry.current.set(id, term);
327|      // Paint the current screen immediately — otherwise a freshly-attached phone
328|      // shows a blank terminal until the next byte of live output arrives.
329|      // get_screen = clean vt100 snapshot (new daemon); falls back silently if the
330|      // daemon predates it — get_buffer would scroll a redraw-shell prompt off-screen.
331|      send({ type: "get_screen", id });
332|    },
333|    [send]
334|  );
335|
336|  const unregisterTerminal = useCallback((id: string) => {
337|    termRegistry.current.delete(id);
338|  }, []);
339|
340|  // Repaint every open terminal whenever we (re)connect — a dropped socket misses
341|  // live output, so pull a fresh vt100 snapshot. On the very first connect the
342|  // registry is empty (each terminal requests its own screen on mount).
343|  useEffect(() => {
344|    if (connection === "connected") {
345|      for (const id of termRegistry.current.keys()) {
346|        send({ type: "get_screen", id });
347|      }
348|    }
349|  }, [connection, send]);
350|
351|  if (connection !== "connected") {
352|    return <ConnectScreen onConnect={handleConnect} />;
353|  }
354|
355|  return (
356|    <div className="m-app">
357|      {view === "home" && (
358|        <Home
359|          terminals={terminals}
360|          activeTerminalId={activeTerminalId}
361|          workspaces={workspaces}
362|          activeWorkspaceIdx={activeWorkspaceIdx}
363|          connected={connection === "connected"}
364|          lastOutputAt={lastOutputAt}
365|          onSelectTerminal={handleSelectTerminal}
366|          onNewTerminal={handleSpawn}
367|          onSwitchWorkspace={handleSwitchWorkspace}
368|          onManageWorkspaces={() => setShowWorkspacePicker(true)}
369|          onOpenFiles={() => setShowFiles(true)}
370|          onOpenClipboard={() => setShowClipboard(true)}
371|          onOpenSettings={() => setShowSettings(true)}
372|          onDeleteTerminal={handleDeleteTerminal}
373|        />
374|      )}
375|
376|      <div className="m-terminal-shell" style={{ display: view === "terminal" ? "flex" : "none" }}>
377|        <div className="m-terminal-area" onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
378|          {terminals.map((t) => (
379|            <TerminalViewWrapper
380|              key={t.id}
381|              id={t.id}
382|              active={t.id === activeTerminalId}
383|              isActive={activeStates[t.id] ?? true}
384|              cols={sizes[t.id]?.cols}
385|              rows={sizes[t.id]?.rows}
386|              fontSize={fontSize}
387|              onData={handleTerminalData}
388|              onResize={handleResize}
389|              onActivate={() => setActiveStates((prev) => ({ ...prev, [t.id]: true }))}
390|              onRegister={registerTerminal}
391|              onUnregister={unregisterTerminal}
392|              onRegisterSearch={registerSearch}
393|              onUnregisterSearch={unregisterSearch}
394|            />
395|          ))}
396|        </div>
397|
398|        {showSearch && (
399|          <SearchBar
400|            onFind={(q, backwards) => {
401|              const addon = activeTerminalId ? searchRegistry.current.get(activeTerminalId) : undefined;
402|              if (!addon || !q) return;
403|              backwards ? addon.findPrevious(q) : addon.findNext(q);
404|            }}
405|            onClose={() => setShowSearch(false)}
406|          />
407|        )}
408|
409|        {snippets.length > 0 && (
410|          <SnippetBar
411|            snippets={snippets}
412|            onSend={(text) => {
413|              haptic();
              handleTerminalData(text + "\r");
415|");
416|");
417|            }}
418|          />
419|        )}
420|
421|        {/* Quick action buttons: spawn terminal + copy screen */}
422|        <div className="m-quick-actions">
423|          <button className="m-quick-btn" onTouchStart={(e) => { e.preventDefault(); haptic(); handleSpawn(); }} onClick={() => { haptic(); handleSpawn(); }}>
424|            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
425|            <span>New</span>
426|          </button>
427|          <button className="m-quick-btn" onTouchStart={(e) => { e.preventDefault(); haptic(); if (activeTerminalId) send({ type: "get_screen", id: activeTerminalId }); }} onClick={() => { haptic(); if (activeTerminalId) send({ type: "get_screen", id: activeTerminalId }); }}>
428|            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
429|            <span>Screen</span>
430|          </button>
431|        </div>
432|
433|        {keysOpen && <Toolbar onKey={handleTerminalData} />}
434|        <InputRow
435|          onImage={handleImage}
436|          onUpload={handleUpload}
437|          onMenu={() => setView("home")}
438|          onSearch={() => setShowSearch((v) => !v)}
439|          keysOpen={keysOpen}
440|          onToggleKeys={toggleKeys}
441|        />
442|      </div>
443|
444|      {showCustomizeToolbar && (
445|        <CustomizeToolbar onClose={() => setShowCustomizeToolbar(false)} />
446|      )}
447|
448|      {showSettings && (
449|        <div className="m-page-overlay">
450|          <div className="m-page-head">
451|            <button className="m-page-back" onClick={() => setShowSettings(false)} aria-label="Back">
452|              ‹
453|            </button>
454|            <span>Settings</span>
455|          </div>
456|          <Settings
457|            host={host}
458|            connected={connection === "connected"}
459|            onCustomizeToolbar={() => setShowCustomizeToolbar(true)}
460|            onChangeServer={() => {
461|              setShowSettings(false);
462|              disconnect();
463|            }}
464|            onSwitchHost={(h) => {
465|              setShowSettings(false);
466|              handleConnect(h);
467|            }}
468|          />
469|        </div>
470|      )}
471|
472|      {showFiles && (
473|        <div className="m-page-overlay">
474|          <div className="m-page-head">
475|            <button className="m-page-back" onClick={() => setShowFiles(false)} aria-label="Back">
476|              ‹
477|            </button>
478|            <span>Files</span>
479|          </div>
480|          <FilesPage onOpenInTerminal={handleOpenInTerminal} />
481|        </div>
482|      )}
483|
484|      {showClipboard && (
485|        <div className="m-page-overlay">
486|          <div className="m-page-head">
487|            <button className="m-page-back" onClick={() => setShowClipboard(false)} aria-label="Back">
488|              ‹
489|            </button>
490|            <span>Clipboard</span>
491|          </div>
492|          <ClipboardPage onClipboard={handleClipboard} onTerminal={handleSendToTerminal} onTypeGlobal={handleTypeGlobal} onKeyGlobal={handleKeyGlobal} />
493|        </div>
494|      )}
495|
496|      <Toast />
497|
498|      {showWorkspacePicker && (
499|        <WorkspacePicker
500|          onSwitch={handleSwitchWorkspace}
501|