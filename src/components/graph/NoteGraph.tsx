import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { listDir, readFile } from "../../hooks/useTauriIpc";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { useFileBrowserStore } from "../../store/fileBrowserStore";
import { usePanelStore } from "../../store/panelStore";
import s from "./NoteGraph.module.css";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  path: string;
  linkCount: number;
  tags: string[];
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim().replace(/\//g, "\\"));
  }
  return links;
}

function extractTags(content: string): string[] {
  const tags = new Set<string>();
  // inline #tags (latin + cyrillic via Ѐ-ӿ)
  const re = /(^|\s)#([a-zA-Z0-9_Ѐ-ӿ][a-zA-Z0-9_Ѐ-ӿ/-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) tags.add(m[2].toLowerCase());
  // frontmatter: tags: [a, b] / tags: a, b
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const tagLine = fm[1].match(/^tags:\s*\[?([^\]\n]*)\]?/m);
    if (tagLine) {
      for (const t of tagLine[1].split(",")) {
        const v = t.trim().replace(/^["'#]+|["']+$/g, "").toLowerCase();
        if (v) tags.add(v);
      }
    }
  }
  return [...tags];
}

function normalizeKey(path: string): string {
  const name = path.split("\\").pop() || path;
  return name.replace(/\.md$/i, "").toLowerCase();
}

async function scanMdFiles(rootPath: string): Promise<Map<string, { path: string; content: string }>> {
  const files = new Map<string, { path: string; content: string }>();
  const queue = [rootPath];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await listDir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.is_dir) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "target") {
          queue.push(entry.path);
        }
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        try {
          const content = await readFile(entry.path);
          files.set(entry.path, { path: entry.path, content });
        } catch {
          // skip unreadable
        }
      }
    }
  }
  return files;
}

function buildGraph(files: Map<string, { path: string; content: string }>): GraphData {
  const keyToPath = new Map<string, string>();
  for (const [path] of files) {
    keyToPath.set(normalizeKey(path), path);
  }

  const linkCounts = new Map<string, number>();
  const linksSet = new Set<string>();
  const links: GraphLink[] = [];

  for (const [path, { content }] of files) {
    const wikiLinks = extractWikiLinks(content);
    for (const target of wikiLinks) {
      const targetKey = target.replace(/\.md$/i, "").toLowerCase();
      const targetPath = keyToPath.get(targetKey);
      if (targetPath && targetPath !== path) {
        const edgeKey = [path, targetPath].sort().join("|||");
        if (!linksSet.has(edgeKey)) {
          linksSet.add(edgeKey);
          links.push({ source: path, target: targetPath });
          linkCounts.set(path, (linkCounts.get(path) || 0) + 1);
          linkCounts.set(targetPath, (linkCounts.get(targetPath) || 0) + 1);
        }
      }
    }
  }

  const nodes: GraphNode[] = [];
  for (const [path, { content }] of files) {
    const name = path.split("\\").pop()?.replace(/\.md$/i, "") || path;
    nodes.push({
      id: path,
      label: name,
      path,
      linkCount: linkCounts.get(path) || 0,
      tags: extractTags(content),
    });
  }

  return { nodes, links };
}

function linkEndId(end: string | GraphNode): string {
  return typeof end === "object" ? end.id : end;
}

function filterGraph(full: GraphData, tag: string | null, focusId: string | null): GraphData {
  let nodes = full.nodes;
  let links = full.links;
  if (tag) {
    const keep = new Set(nodes.filter((n) => n.tags.includes(tag)).map((n) => n.id));
    nodes = nodes.filter((n) => keep.has(n.id));
    links = links.filter((l) => keep.has(linkEndId(l.source)) && keep.has(linkEndId(l.target)));
  }
  if (focusId) {
    const keep = new Set<string>([focusId]);
    for (const l of links) {
      if (linkEndId(l.source) === focusId) keep.add(linkEndId(l.target));
      if (linkEndId(l.target) === focusId) keep.add(linkEndId(l.source));
    }
    nodes = nodes.filter((n) => keep.has(n.id));
    links = links.filter((l) => keep.has(linkEndId(l.source)) && keep.has(linkEndId(l.target)));
  }
  // d3 mutates nodes/links, so hand the simulation fresh copies
  const nodeCopies = nodes.map((n) => ({ ...n, fx: null, fy: null }));
  const linkCopies = links.map((l) => ({ source: linkEndId(l.source), target: linkEndId(l.target) }));
  return { nodes: nodeCopies, links: linkCopies };
}

function nodeRadius(linkCount: number): number {
  return Math.max(6, Math.min(18, 6 + linkCount * 2.5));
}

export default function NoteGraph({ embedded }: { embedded?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const graphRef = useRef<GraphData>({ nodes: [], links: [] });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    node: GraphNode | null;
    startX: number;
    startY: number;
    isPan: boolean;
    moved: boolean;
  }>({ node: null, startX: 0, startY: 0, isPan: false, moved: false });
  const hoveredRef = useRef<GraphNode | null>(null);
  const fullGraphRef = useRef<GraphData>({ nodes: [], links: [] });
  const searchRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [inputPath, setInputPath] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  const openFile = useFileViewerStore((st) => st.openFile);
  const hasFileTabs = useFileViewerStore((st) => st.fileTabs.length > 0);
  const toggleGraph = usePanelStore((st) => st.toggleGraph);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { x: tx, y: ty, k } = transformRef.current;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(tx + w / 2, ty + h / 2);
    ctx.scale(k, k);

    const { nodes, links } = graphRef.current;
    const hovered = hoveredRef.current;
    const connectedToHover = new Set<string>();
    if (hovered) {
      for (const l of links) {
        const src = typeof l.source === "object" ? l.source.id : l.source;
        const tgt = typeof l.target === "object" ? l.target.id : l.target;
        if (src === hovered.id || tgt === hovered.id) {
          connectedToHover.add(src);
          connectedToHover.add(tgt);
        }
      }
    }

    for (const l of links) {
      const src = l.source as GraphNode;
      const tgt = l.target as GraphNode;
      if (src.x == null || tgt.x == null) continue;

      const isHighlighted = hovered && connectedToHover.has(src.id) && connectedToHover.has(tgt.id);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y!);
      ctx.lineTo(tgt.x, tgt.y!);
      ctx.strokeStyle = hovered
        ? isHighlighted ? "rgba(233,69,96,0.7)" : "rgba(80,80,80,0.1)"
        : "rgba(140,140,140,0.35)";
      ctx.lineWidth = isHighlighted ? 2.5 : 1;
      ctx.stroke();
    }

    for (const node of nodes) {
      if (node.x == null) continue;
      const r = nodeRadius(node.linkCount);
      const isHovered = hovered?.id === node.id;
      const isConnected = hovered && connectedToHover.has(node.id);
      const dimmed = hovered && !isConnected;

      if (isHovered || isConnected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "rgba(233,69,96,0.2)" : "rgba(233,69,96,0.1)";
        ctx.fill();
      }

      if (searchRef.current && node.label.toLowerCase().includes(searchRef.current)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#e5a50a";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y!, r, 0, Math.PI * 2);
      ctx.fillStyle = dimmed
        ? "rgba(80,80,80,0.2)"
        : isHovered
          ? "#e94560"
          : isConnected
            ? "rgba(233,69,96,0.85)"
            : node.linkCount > 0
              ? "rgba(233,69,96,0.6)"
              : "rgba(180,80,100,0.35)";
      ctx.fill();

      if (!dimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered ? "rgba(233,69,96,0.9)" : "rgba(233,69,96,0.2)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();
      }

      const fontSize = isHovered ? 13 : 11;
      ctx.font = `${isHovered ? "600" : "400"} ${fontSize}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = dimmed
        ? "rgba(120,120,120,0.2)"
        : isHovered
          ? "#ffffff"
          : isConnected
            ? "rgba(230,230,230,0.95)"
            : "rgba(200,200,200,0.75)";
      ctx.fillText(node.label, node.x, node.y! + r + 16);
    }

    ctx.restore();
  }, []);

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const { nodes } = graphRef.current;
    if (!canvas || nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x == null) continue;
      const r = nodeRadius(n.linkCount) + 20;
      minX = Math.min(minX, n.x - r);
      maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y! - r);
      maxY = Math.max(maxY, n.y! + r);
    }
    if (!isFinite(minX)) return;

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    const padding = 60;

    const scale = Math.min(
      (canvasW - padding * 2) / (graphW || 1),
      (canvasH - padding * 2) / (graphH || 1),
      3
    );

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    transformRef.current = {
      x: -cx * scale,
      y: -cy * scale,
      k: scale,
    };
    draw();
  }, [draw]);

  const setupSim = useCallback((graph: GraphData) => {
    graphRef.current = graph;
    setNodeCount(graph.nodes.length);

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation(graph.nodes)
      .force("link", forceLink<GraphNode, GraphLink>(graph.links).id((d) => d.id).distance(100).strength(1))
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide(25))
      .force("x", forceX(0).strength(0.08))
      .force("y", forceY(0).strength(0.08))
      .on("tick", draw);

    sim.on("end", fitView);

    simRef.current = sim;
  }, [draw, fitView]);

  const loadGraph = useCallback(async (path: string) => {
    setLoading(true);
    const files = await scanMdFiles(path);
    const graph = buildGraph(files);
    fullGraphRef.current = graph;
    setAllTags([...new Set(graph.nodes.flatMap((n) => n.tags))].sort());
    setFocusId(null);
    setTagFilter("");
    setupSim(filterGraph(graph, null, null));
    setLoading(false);
  }, [setupSim]);

  // Re-run the simulation on a filtered subset when tag/focus changes
  useEffect(() => {
    if (fullGraphRef.current.nodes.length === 0) return;
    setupSim(filterGraph(fullGraphRef.current, tagFilter || null, focusId));
  }, [tagFilter, focusId, setupSim]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    searchRef.current = v.trim().toLowerCase();
    draw();
  }, [draw]);

  const centerOnSearchMatch = useCallback(() => {
    const q = searchRef.current;
    if (!q) return;
    const node = graphRef.current.nodes.find((n) => n.label.toLowerCase().includes(q));
    if (!node || node.x == null) return;
    const t = transformRef.current;
    t.x = -node.x * t.k;
    t.y = -node.y! * t.k;
    draw();
  }, [draw]);

  useEffect(() => {
    const browsePath = useFileBrowserStore.getState().currentBrowsePath;
    const initial = browsePath || "C:\\Users";
    setInputPath(initial);
    loadGraph(initial);

    return () => {
      simRef.current?.stop();
    };
  }, [loadGraph]);

  // resize observer — redraw and fit when container changes size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      fitView();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitView]);

  const findNodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
    const { x: tx, y: ty, k } = transformRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const w = canvas.clientWidth / 2;
    const h = canvas.clientHeight / 2;
    const mx = (cx - tx - w) / k;
    const my = (cy - ty - h) / k;

    for (const node of graphRef.current.nodes) {
      if (node.x == null) continue;
      const r = nodeRadius(node.linkCount) + 6;
      const dx = node.x - mx;
      const dy = node.y! - my;
      if (dx * dx + dy * dy < r * r) return node;
    }
    return null;
  }, []);

  const applyZoom = useCallback((factor: number, pivotX?: number, pivotY?: number) => {
    const t = transformRef.current;
    const newK = Math.max(0.2, Math.min(8, t.k * factor));
    if (pivotX !== undefined && pivotY !== undefined) {
      const canvas = canvasRef.current;
      if (canvas) {
        const cx = pivotX - canvas.clientWidth / 2;
        const cy = pivotY - canvas.clientHeight / 2;
        t.x = cx - (cx - t.x) * (newK / t.k);
        t.y = cy - (cy - t.y) * (newK / t.k);
      }
    }
    t.k = newK;
    draw();
  }, [draw]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (e.ctrlKey) {
      // pinch-to-zoom on trackpad
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      applyZoom(factor, px, py);
    } else {
      // regular scroll → pan, scroll+shift → horizontal pan
      const t = transformRef.current;
      t.x -= e.deltaX;
      t.y -= e.deltaY;
      draw();
    }
  }, [applyZoom, draw]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const node = findNodeAt(cx, cy);

    if (node) {
      dragRef.current = { node, startX: cx, startY: cy, isPan: false, moved: false };
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      dragRef.current = { node: null, startX: e.clientX, startY: e.clientY, isPan: true, moved: false };
    }
  }, [findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const drag = dragRef.current;

    if (drag.isPan) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      const t = transformRef.current;
      t.x += dx;
      t.y += dy;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      draw();
    } else if (drag.node) {
      drag.moved = true;
      const { x: tx, y: ty, k } = transformRef.current;
      const w = canvasRef.current!.clientWidth / 2;
      const h = canvasRef.current!.clientHeight / 2;
      drag.node.fx = (cx - tx - w) / k;
      drag.node.fy = (cy - ty - h) / k;
    } else {
      const prev = hoveredRef.current;
      const node = findNodeAt(cx, cy);
      if (prev?.id !== node?.id) {
        hoveredRef.current = node;
        canvasRef.current!.style.cursor = node ? "pointer" : "grab";
        draw();
      }
    }
  }, [draw, findNodeAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;

    if (drag.node) {
      // single click on node (not drag) → open file
      if (!drag.moved) {
        openFile(drag.node.path);
      }
      drag.node.fx = null;
      drag.node.fy = null;
      simRef.current?.alphaTarget(0);
    }

    dragRef.current = { node: null, startX: 0, startY: 0, isPan: false, moved: false };
  }, [openFile]);

  const handlePathSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) loadGraph(inputPath.trim());
  }, [inputPath, loadGraph]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node) setFocusId(node.id);
  }, [findNodeAt]);

  const graphHeader = (
    <div className={s.header}>
      <div className={s.headerLeft}>
        <span className={s.badge}>{nodeCount} notes</span>
        <input
          className={s.pathInput}
          style={{ width: 110 }}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") centerOnSearchMatch(); }}
          placeholder="Find note…"
          spellCheck={false}
          title="Highlight matching notes; Enter centers on first match"
        />
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            title="Filter by tag"
            style={{
              background: "#1a1a1a", color: "var(--text)", border: "1px solid #333",
              borderRadius: 4, fontSize: 11, padding: "2px 4px", maxWidth: 110,
            }}
          >
            <option value="">all tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>#{t}</option>
            ))}
          </select>
        )}
        {focusId && (
          <button
            className={s.scanBtn}
            onClick={() => setFocusId(null)}
            title="Exit local graph (right-click a node to focus it)"
          >
            ✕ local
          </button>
        )}
      </div>
      <div className={s.headerRight}>
        <form onSubmit={handlePathSubmit} className={s.pathForm}>
          <input
            className={s.pathInput}
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="Root path..."
            spellCheck={false}
          />
          <button type="submit" className={s.scanBtn}>Scan</button>
        </form>
        {!embedded && <button className={s.closeBtn} onClick={toggleGraph} title="Close">✕</button>}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {graphHeader}
        <div className={s.canvasWrap} ref={containerRef}>
          {loading && <div className={s.loading}>Scanning .md files...</div>}
          <canvas
            ref={canvasRef}
            className={s.canvas}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
            onMouseLeave={() => {
              const drag = dragRef.current;
              if (drag.node) { drag.node.fx = null; drag.node.fy = null; simRef.current?.alphaTarget(0); }
              dragRef.current = { node: null, startX: 0, startY: 0, isPan: false, moved: false };
            }}
          />
          <div className={s.zoomControls}>
            <button className={s.zoomBtn} onClick={() => applyZoom(1.3)} title="Zoom in">+</button>
            <button className={s.zoomBtn} onClick={() => applyZoom(0.7)} title="Zoom out">−</button>
            <button className={s.zoomBtn} onClick={fitView} title="Fit view">⊙</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.container} style={hasFileTabs ? { right: "50%" } : undefined}>
      {graphHeader}
      <div className={s.canvasWrap} ref={containerRef}>
        {loading && (
          <div className={s.loading}>Scanning .md files...</div>
        )}
        <canvas
          ref={canvasRef}
          className={s.canvas}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          onMouseLeave={() => {
            const drag = dragRef.current;
            if (drag.node) {
              drag.node.fx = null;
              drag.node.fy = null;
              simRef.current?.alphaTarget(0);
            }
            dragRef.current = { node: null, startX: 0, startY: 0, isPan: false, moved: false };
          }}
        />
        <div className={s.zoomControls}>
          <button className={s.zoomBtn} onClick={() => applyZoom(1.3)} title="Zoom in">+</button>
          <button className={s.zoomBtn} onClick={() => applyZoom(0.7)} title="Zoom out">−</button>
          <button className={s.zoomBtn} onClick={fitView} title="Fit view">⊙</button>
        </div>
      </div>
    </div>
  );
}
