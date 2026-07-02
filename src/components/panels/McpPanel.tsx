import { useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { readFile, writeFile } from "../../hooks/useTauriIpc";
import s from "./Panels.module.css";

interface McpServer {
  name: string;
  fullName: string;
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  source: "claude-settings" | "claude-mcp-json" | "codex-toml";
  sourcePath: string;
}

interface PluginEntry {
  name: string;
  fullName: string;
  version?: string;
  enabled: boolean;
  source: "claude" | "codex";
  sourcePath: string;
}

interface SkillEntry {
  name: string;
  system?: boolean;
}

interface CloudService {
  name: string;
}

interface ToolData {
  mcpServers: McpServer[];
  plugins: PluginEntry[];
  skills: SkillEntry[];
  cloudServices: CloudService[];
  projectMcp: { cwd: string; servers: McpServer[] }[];
}

async function tryRead(path: string): Promise<string | null> {
  try { return await readFile(path); } catch { return null; }
}

function np(p: string) { return p.replace(/\//g, "\\"); }

function maskSecrets(text: string): string {
  return text
    .replace(/(--api-key\s+)\S+/gi, "$1***")
    .replace(/(--token\s+)\S+/gi, "$1***")
    .replace(/(bearer\s+)\S+/gi, "$1***");
}

function shortenCommand(cmd: string, args?: string[]): string {
  let full = cmd;
  if (args?.length) full += " " + args.join(" ");
  full = maskSecrets(full);
  return full;
}

// --- Toggle logic ---

async function toggleClaudeMcpServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.mcpServers?.[srv.fullName]) {
      data.mcpServers[srv.fullName].disabled = !enabled;
    }
    await writeFile(srv.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleClaudeMcpJsonServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const servers = data.mcpServers || data;
    if (servers[srv.fullName]) {
      servers[srv.fullName].disabled = !enabled;
    }
    await writeFile(srv.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleClaudePlugin(plugin: PluginEntry, enabled: boolean) {
  const raw = await tryRead(plugin.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data.enabledPlugins) data.enabledPlugins = {};
    data.enabledPlugins[plugin.fullName] = enabled;
    await writeFile(plugin.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleCodexMcpServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  const sectionHeader = `[mcp_servers.${srv.fullName}]`;
  const idx = raw.indexOf(sectionHeader);
  if (idx === -1) return;
  const afterHeader = idx + sectionHeader.length;
  const nextSection = raw.indexOf("\n[", afterHeader + 1);
  const blockEnd = nextSection !== -1 ? nextSection : raw.length;
  const block = raw.slice(afterHeader, blockEnd);
  const enabledRegex = /^enabled\s*=\s*(true|false)/m;
  let newBlock: string;
  if (enabledRegex.test(block)) {
    newBlock = block.replace(enabledRegex, `enabled = ${enabled}`);
  } else {
    newBlock = `\nenabled = ${enabled}` + block;
  }
  const result = raw.slice(0, afterHeader) + newBlock + raw.slice(blockEnd);
  await writeFile(srv.sourcePath, result);
}

async function toggleCodexPlugin(plugin: PluginEntry, enabled: boolean) {
  const raw = await tryRead(plugin.sourcePath);
  if (!raw) return;
  const sectionHeader = `[plugins."${plugin.fullName}"]`;
  const idx = raw.indexOf(sectionHeader);
  if (idx === -1) return;
  const afterHeader = idx + sectionHeader.length;
  const nextSection = raw.indexOf("\n[", afterHeader + 1);
  const blockEnd = nextSection !== -1 ? nextSection : raw.length;
  const block = raw.slice(afterHeader, blockEnd);
  const newBlock = block.replace(/^enabled\s*=\s*(true|false)/m, `enabled = ${enabled}`);
  const result = raw.slice(0, afterHeader) + newBlock + raw.slice(blockEnd);
  await writeFile(plugin.sourcePath, result);
}

// --- Add / Edit / Delete ---

interface ServerDraft {
  source: McpServer["source"];
  sourcePath: string;
  oldName?: string;
  name: string;
  command: string;
  argsText: string; // one arg per line
  url: string;
  envText: string; // KEY=VALUE per line
}

function parseDraft(d: ServerDraft): { command?: string; args?: string[]; url?: string; env?: Record<string, string> } {
  const cfg: any = {};
  if (d.command.trim()) cfg.command = d.command.trim();
  const args = d.argsText.split("\n").map((a) => a.trim()).filter(Boolean);
  if (args.length) cfg.args = args;
  if (d.url.trim()) cfg.url = d.url.trim();
  const env: Record<string, string> = {};
  for (const line of d.envText.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if (Object.keys(env).length) cfg.env = env;
  return cfg;
}

async function upsertJsonServer(sourcePath: string, name: string, cfg: any, oldName?: string) {
  const raw = await tryRead(sourcePath);
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { return; }
  const servers = data.mcpServers && typeof data.mcpServers === "object"
    ? data.mcpServers
    : (data.mcpServers = {});
  const existing = oldName ? servers[oldName] : servers[name];
  if (oldName && oldName !== name) delete servers[oldName];
  // Merge over existing so fields we don't edit (headers, etc.) survive
  servers[name] = { ...(existing || {}), ...cfg };
  await writeFile(sourcePath, JSON.stringify(data, null, 2));
}

async function deleteJsonServer(sourcePath: string, name: string) {
  const raw = await tryRead(sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.mcpServers?.[name]) delete data.mcpServers[name];
    else if (data[name]) delete data[name];
    await writeFile(sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

function removeTomlSection(raw: string, name: string): string {
  const header = `[mcp_servers.${name}]`;
  const idx = raw.indexOf(header);
  if (idx === -1) return raw;
  const next = raw.indexOf("\n[", idx + header.length);
  return (raw.slice(0, idx) + (next !== -1 ? raw.slice(next + 1) : "")).trimEnd() + "\n";
}

async function upsertTomlServer(tomlPath: string, name: string, cfg: any, oldName?: string) {
  let raw = (await tryRead(tomlPath)) || "";
  if (oldName) raw = removeTomlSection(raw, oldName);
  if (oldName !== name) raw = removeTomlSection(raw, name);
  let section = `\n[mcp_servers.${name}]\n`;
  if (cfg.command) section += `command = "${cfg.command}"\n`;
  if (cfg.args?.length) section += `args = [${cfg.args.map((a: string) => `"${a}"`).join(", ")}]\n`;
  if (cfg.url) section += `url = "${cfg.url}"\n`;
  if (cfg.env) {
    const pairs = Object.entries(cfg.env).map(([k, v]) => `"${k}" = "${v}"`).join(", ");
    section += `env = { ${pairs} }\n`;
  }
  await writeFile(tomlPath, raw.trimEnd() + "\n" + section);
}

async function deleteTomlServer(tomlPath: string, name: string) {
  const raw = await tryRead(tomlPath);
  if (!raw) return;
  await writeFile(tomlPath, removeTomlSection(raw, name));
}

// --- Data loading ---

async function loadClaudeData(homeDir: string, cwds: string[]): Promise<ToolData> {
  const data: ToolData = { mcpServers: [], plugins: [], skills: [], cloudServices: [], projectMcp: [] };
  const settingsPath = np(`${homeDir}/.claude/settings.json`);

  const settingsRaw = await tryRead(settingsPath);
  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw);
      const enabledMcp = new Set<string>(settings.enabledMcpjsonServers || []);
      const enabledPlugins: Record<string, boolean> = settings.enabledPlugins || {};

      if (settings.mcpServers) {
        for (const [name, cfg] of Object.entries<any>(settings.mcpServers)) {
          data.mcpServers.push({
            name, fullName: name, command: cfg.command, args: cfg.args, url: cfg.url,
            enabled: cfg.disabled !== true,
            source: "claude-settings", sourcePath: settingsPath,
          });
        }
      }

      for (const [fullName, enabled] of Object.entries(enabledPlugins)) {
        const shortName = fullName.split("@")[0];
        data.plugins.push({ name: shortName, fullName, enabled: !!enabled, source: "claude", sourcePath: settingsPath });
      }

      for (const name of enabledMcp) {
        if (!data.mcpServers.find((m) => m.name === name)) {
          data.mcpServers.push({ name, fullName: name, enabled: true, source: "claude-settings", sourcePath: settingsPath });
        }
      }
    } catch {}
  }

  const pluginsRaw = await tryRead(np(`${homeDir}/.claude/plugins/installed_plugins.json`));
  if (pluginsRaw) {
    try {
      const pluginsData = JSON.parse(pluginsRaw);
      const plugins: Record<string, any[]> = pluginsData.plugins || {};
      for (const fullName of Object.keys(plugins)) {
        const shortName = fullName.split("@")[0];
        const existing = data.plugins.find((p) => p.fullName === fullName);
        if (existing) {
          existing.version = plugins[fullName][0]?.version;
        } else {
          data.plugins.push({
            name: shortName, fullName, version: plugins[fullName][0]?.version,
            enabled: false, source: "claude", sourcePath: settingsPath,
          });
        }
      }
    } catch {}
  }

  const authRaw = await tryRead(np(`${homeDir}/.claude/mcp-needs-auth-cache.json`));
  if (authRaw) {
    try {
      for (const name of Object.keys(JSON.parse(authRaw))) {
        data.cloudServices.push({ name });
      }
    } catch {}
  }

  for (const cwd of cwds) {
    const servers: McpServer[] = [];
    const mcpJsonPath = np(`${cwd}/.mcp.json`);
    const mcpRaw = await tryRead(mcpJsonPath);
    if (mcpRaw) {
      try {
        const d = JSON.parse(mcpRaw);
        const mcpServers = d.mcpServers || d;
        for (const [name, cfg] of Object.entries<any>(mcpServers)) {
          servers.push({
            name, fullName: name, command: cfg.command, args: cfg.args, url: cfg.url,
            enabled: cfg.disabled !== true,
            source: "claude-mcp-json", sourcePath: mcpJsonPath,
          });
        }
      } catch {}
    }
    if (servers.length > 0) data.projectMcp.push({ cwd, servers });
  }

  return data;
}

async function loadCodexData(homeDir: string): Promise<ToolData> {
  const data: ToolData = { mcpServers: [], plugins: [], skills: [], cloudServices: [], projectMcp: [] };
  const tomlPath = np(`${homeDir}/.codex/config.toml`);

  const tomlRaw = await tryRead(tomlPath);
  if (tomlRaw) {
    const mcpRegex = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm;
    let match;
    const sections: { name: string; start: number }[] = [];
    while ((match = mcpRegex.exec(tomlRaw)) !== null) {
      sections.push({ name: match[1], start: match.index + match[0].length });
    }
    for (let i = 0; i < sections.length; i++) {
      const nextSection = tomlRaw.indexOf("\n[", sections[i].start + 1);
      const end = nextSection !== -1 ? nextSection : tomlRaw.length;
      const block = tomlRaw.slice(sections[i].start, end);
      const getVal = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
        return m ? m[1] : undefined;
      };
      const getBool = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*(true|false)`, "m"));
        return m ? m[1] === "true" : undefined;
      };
      const getArr = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)]`, "m"));
        if (!m) return undefined;
        return m[1].match(/"([^"]*)"/g)?.map((v) => v.replace(/"/g, "")) || [];
      };
      data.mcpServers.push({
        name: sections[i].name, fullName: sections[i].name,
        command: getVal("command"), args: getArr("args"), url: getVal("url"),
        enabled: getBool("enabled") ?? true,
        source: "codex-toml", sourcePath: tomlPath,
      });
    }

    const pluginRegex = /\[plugins\."([^"]+)"\]/g;
    while ((match = pluginRegex.exec(tomlRaw)) !== null) {
      const pStart = match.index + match[0].length;
      const pNext = tomlRaw.indexOf("\n[", pStart + 1);
      const pBlock = tomlRaw.slice(pStart, pNext !== -1 ? pNext : tomlRaw.length);
      const enabledMatch = pBlock.match(/^enabled\s*=\s*(true|false)/m);
      const enabled = enabledMatch ? enabledMatch[1] === "true" : true;
      const fullName = match[1];
      data.plugins.push({
        name: fullName.split("@")[0], fullName,
        enabled, source: "codex", sourcePath: tomlPath,
      });
    }
  }

  const skillsPath = np(`${homeDir}/.codex/skills`);
  try {
    const { listDir } = await import("../../hooks/useTauriIpc");
    const entries = await listDir(skillsPath);
    for (const entry of entries) {
      if (entry.name === ".system") continue;
      if (entry.is_dir) data.skills.push({ name: entry.name });
    }
    try {
      const sysEntries = await listDir(np(`${skillsPath}/.system`));
      for (const entry of sysEntries) {
        if (entry.is_dir) data.skills.push({ name: entry.name, system: true });
      }
    } catch {}
  } catch {}

  return data;
}

// --- Components ---

const ICON_MCP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 8v4M9.5 14.5L7 17M14.5 14.5L17 17"/></svg>';
const ICON_CLOUD = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>';
const ICON_PLUGIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3"/></svg>';
const ICON_SKILL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>';
const ICON_PROJECT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`${s.mcpToggle} ${on ? s.mcpToggleOn : ""}`}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      title={on ? "Disable" : "Enable"}
    >
      <span className={s.mcpToggleKnob} />
    </button>
  );
}

function CollapsibleSection({ title, icon, count, defaultOpen, children }: {
  title: string; icon: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (count === 0) return null;
  return (
    <div className={s.mcpSection}>
      <button className={s.mcpSectionHeader} onClick={() => setOpen(!open)}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, opacity: 0.5 }}>
          <path d="M2 0l4 4-4 4z" />
        </svg>
        <span className={s.mcpSectionIcon} dangerouslySetInnerHTML={{ __html: icon }} />
        <span>{title}</span>
        <span className={s.mcpCount}>{count}</span>
      </button>
      {open && <div className={s.mcpSectionBody}>{children}</div>}
    </div>
  );
}

function ServerCard({ srv, onToggle, onEdit, onDelete }: {
  srv: McpServer;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const detail = srv.command ? shortenCommand(srv.command, srv.args) : srv.url || null;
  const [confirmDel, setConfirmDel] = useState(false);
  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", padding: 2,
    color: "var(--text-dim)", display: "flex", alignItems: "center",
  };

  return (
    <div className={`${s.mcpCard} ${!srv.enabled ? s.mcpCardDim : ""}`}>
      <div className={s.mcpCardRow}>
        <span className={s.mcpDot} data-status={srv.enabled ? "on" : "off"} />
        <span className={s.mcpCardName}>{srv.name}</span>
        <button style={iconBtn} title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button
          style={{ ...iconBtn, color: confirmDel ? "#e94560" : "var(--text-dim)" }}
          title={confirmDel ? "Click again to delete" : "Delete"}
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDel) onDelete();
            else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 2500); }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <Toggle on={srv.enabled} onChange={onToggle} />
      </div>
      {detail && <div className={s.mcpCardDetail} title={detail}>{detail}</div>}
    </div>
  );
}

function ProviderBlock({ label, icon, data, accent, onToggleMcp, onTogglePlugin, onAddServer, onEditServer, onDeleteServer }: {
  label: string; icon: string; data: ToolData | null; accent: string;
  onToggleMcp: (srv: McpServer, enabled: boolean) => void;
  onTogglePlugin: (p: PluginEntry, enabled: boolean) => void;
  onAddServer: () => void;
  onEditServer: (srv: McpServer) => void;
  onDeleteServer: (srv: McpServer) => void;
}) {
  if (!data) return null;

  return (
    <div className={s.mcpProvider}>
      <div className={s.mcpProviderHeader} style={{ borderLeftColor: accent }}>
        <span dangerouslySetInnerHTML={{ __html: icon }} />
        <span>{label}</span>
        <button
          onClick={onAddServer}
          title="Add MCP server"
          style={{
            marginLeft: "auto", background: "none", border: "1px solid #333", borderRadius: 4,
            color: "var(--text-dim)", fontSize: 11, padding: "2px 8px", cursor: "pointer",
          }}
        >
          + Add server
        </button>
      </div>

      <CollapsibleSection title="MCP Servers" icon={ICON_MCP} count={data.mcpServers.length} defaultOpen>
        {data.mcpServers.map((srv) => (
          <ServerCard
            key={srv.name}
            srv={srv}
            onToggle={(v) => onToggleMcp(srv, v)}
            onEdit={() => onEditServer(srv)}
            onDelete={() => onDeleteServer(srv)}
          />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Cloud Services" icon={ICON_CLOUD} count={data.cloudServices.length}>
        {data.cloudServices.map((svc) => (
          <div key={svc.name} className={s.mcpCard}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpDot} data-status="on" />
              <span className={s.mcpCardName}>{svc.name.replace("claude.ai ", "")}</span>
              <span className={s.mcpBadge}>OAuth</span>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Plugins" icon={ICON_PLUGIN} count={data.plugins.length}>
        {data.plugins.map((p) => (
          <div key={p.fullName} className={`${s.mcpCard} ${!p.enabled ? s.mcpCardDim : ""}`}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpDot} data-status={p.enabled ? "on" : "off"} />
              <span className={s.mcpCardName}>{p.name}</span>
              {p.version && p.version !== "unknown" && (
                <span className={s.mcpVersion}>{p.version}</span>
              )}
              <Toggle on={p.enabled} onChange={(v) => onTogglePlugin(p, v)} />
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Skills" icon={ICON_SKILL} count={data.skills.length}>
        {data.skills.map((sk) => (
          <div key={sk.name + (sk.system ? "-sys" : "")} className={s.mcpCard} style={{ padding: "4px 8px" }}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpCardName}>{sk.name}</span>
              {sk.system && <span className={s.mcpBadge}>system</span>}
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {data.projectMcp.map((proj) => (
        <CollapsibleSection
          key={proj.cwd}
          title={proj.cwd.split("\\").pop() || proj.cwd}
          icon={ICON_PROJECT}
          count={proj.servers.length}
        >
          {proj.servers.map((srv) => (
            <ServerCard
              key={srv.name}
              srv={srv}
              onToggle={(v) => onToggleMcp(srv, v)}
              onEdit={() => onEditServer(srv)}
              onDelete={() => onDeleteServer(srv)}
            />
          ))}
        </CollapsibleSection>
      ))}
    </div>
  );
}

const CLAUDE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
const CODEX_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

export default function McpPanel({ embedded }: { embedded?: boolean } = {}) {
  const homeDir = useWorkspaceStore((st) => st.homeDir);
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const activeIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const [claudeData, setClaudeData] = useState<ToolData | null>(null);
  const [codexData, setCodexData] = useState<ToolData | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ServerDraft | null>(null);

  const loadAll = useCallback(async () => {
    if (!homeDir) return;
    setLoading(true);
    const activeWs = workspaces[activeIdx];
    const cwds = activeWs ? [...new Set(activeWs.panes.map((p) => p.cwd).filter(Boolean))] : [];
    const [claude, codex] = await Promise.all([
      loadClaudeData(homeDir, cwds),
      loadCodexData(homeDir),
    ]);
    setClaudeData(claude);
    setCodexData(codex);
    setLoading(false);
  }, [homeDir, workspaces, activeIdx]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleToggleMcp = useCallback(async (srv: McpServer, enabled: boolean) => {
    if (srv.source === "claude-settings") await toggleClaudeMcpServer(srv, enabled);
    else if (srv.source === "claude-mcp-json") await toggleClaudeMcpJsonServer(srv, enabled);
    else if (srv.source === "codex-toml") await toggleCodexMcpServer(srv, enabled);
    await loadAll();
  }, [loadAll]);

  const handleTogglePlugin = useCallback(async (p: PluginEntry, enabled: boolean) => {
    if (p.source === "claude") await toggleClaudePlugin(p, enabled);
    else if (p.source === "codex") await toggleCodexPlugin(p, enabled);
    await loadAll();
  }, [loadAll]);

  const handleAddServer = useCallback((provider: "claude" | "codex") => {
    setDraft({
      source: provider === "claude" ? "claude-settings" : "codex-toml",
      sourcePath: provider === "claude"
        ? np(`${homeDir}/.claude/settings.json`)
        : np(`${homeDir}/.codex/config.toml`),
      name: "", command: "", argsText: "", url: "", envText: "",
    });
  }, [homeDir]);

  const handleEditServer = useCallback((srv: McpServer) => {
    setDraft({
      source: srv.source,
      sourcePath: srv.sourcePath,
      oldName: srv.fullName,
      name: srv.name,
      command: srv.command || "",
      argsText: (srv.args || []).join("\n"),
      url: srv.url || "",
      envText: "",
    });
  }, []);

  const handleDeleteServer = useCallback(async (srv: McpServer) => {
    if (srv.source === "codex-toml") await deleteTomlServer(srv.sourcePath, srv.fullName);
    else await deleteJsonServer(srv.sourcePath, srv.fullName);
    await loadAll();
  }, [loadAll]);

  const handleSaveDraft = useCallback(async () => {
    if (!draft || !draft.name.trim()) return;
    const cfg = parseDraft(draft);
    const name = draft.name.trim();
    if (draft.source === "codex-toml") {
      await upsertTomlServer(draft.sourcePath, name, cfg, draft.oldName);
    } else {
      await upsertJsonServer(draft.sourcePath, name, cfg, draft.oldName);
    }
    setDraft(null);
    await loadAll();
  }, [draft, loadAll]);

  const isEmpty = claudeData && codexData
    && claudeData.mcpServers.length === 0 && claudeData.plugins.length === 0
    && claudeData.cloudServices.length === 0 && claudeData.projectMcp.length === 0
    && codexData.mcpServers.length === 0 && codexData.plugins.length === 0
    && codexData.skills.length === 0 && codexData.projectMcp.length === 0;

  return (
    <div className={s.settingsWrap}>
      <div className={s.settingsScroll}>
        <div className={s.mcpToolbar}>
          <span className={s.mcpToolbarTitle}>MCP & Tools</span>
          <button className={s.mcpRefreshBtn} onClick={loadAll} disabled={loading} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? s.mcpSpin : ""}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>

        {loading && !claudeData && !codexData && (
          <div className={s.mcpEmpty}>Loading...</div>
        )}

        <ProviderBlock
          label="Claude Code" icon={CLAUDE_ICON} data={claudeData} accent="#f97316"
          onToggleMcp={handleToggleMcp} onTogglePlugin={handleTogglePlugin}
          onAddServer={() => handleAddServer("claude")}
          onEditServer={handleEditServer} onDeleteServer={handleDeleteServer}
        />
        <ProviderBlock
          label="Codex" icon={CODEX_ICON} data={codexData} accent="#22d3ee"
          onToggleMcp={handleToggleMcp} onTogglePlugin={handleTogglePlugin}
          onAddServer={() => handleAddServer("codex")}
          onEditServer={handleEditServer} onDeleteServer={handleDeleteServer}
        />

        {!loading && isEmpty && (
          <div className={s.mcpEmpty}>No MCP servers or tools found</div>
        )}
      </div>

      {draft && (() => {
        const inputStyle: React.CSSProperties = {
          width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12,
          background: "#0f0f0f", border: "1px solid #333", borderRadius: 4, color: "var(--text)",
          fontFamily: "inherit",
        };
        const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-dim)", margin: "8px 0 4px" };
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 1001, display: "flex",
              alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)",
            }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDraft(null); }}
          >
            <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: 16, width: 380, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ fontSize: 13, marginBottom: 4, color: "var(--text)" }}>
                {draft.oldName ? `Edit server: ${draft.oldName}` : "Add MCP server"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>{draft.sourcePath}</div>

              <div style={labelStyle}>Name</div>
              <input style={inputStyle} value={draft.name} spellCheck={false} autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

              <div style={labelStyle}>Command (for stdio servers)</div>
              <input style={inputStyle} value={draft.command} spellCheck={false} placeholder="npx"
                onChange={(e) => setDraft({ ...draft, command: e.target.value })} />

              <div style={labelStyle}>Args (one per line)</div>
              <textarea style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} value={draft.argsText} spellCheck={false}
                placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
                onChange={(e) => setDraft({ ...draft, argsText: e.target.value })} />

              <div style={labelStyle}>URL (for HTTP/SSE servers)</div>
              <input style={inputStyle} value={draft.url} spellCheck={false} placeholder="https://…"
                onChange={(e) => setDraft({ ...draft, url: e.target.value })} />

              <div style={labelStyle}>Env (KEY=VALUE per line{draft.oldName ? ", leave empty to keep existing" : ""})</div>
              <textarea style={{ ...inputStyle, minHeight: 40, resize: "vertical" }} value={draft.envText} spellCheck={false}
                onChange={(e) => setDraft({ ...draft, envText: e.target.value })} />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button
                  style={{ padding: "5px 12px", fontSize: 12, background: "none", border: "1px solid #333", borderRadius: 4, color: "var(--text-dim)", cursor: "pointer" }}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
                <button
                  style={{ padding: "5px 12px", fontSize: 12, background: "var(--accent)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", opacity: draft.name.trim() ? 1 : 0.5 }}
                  onClick={handleSaveDraft}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
