import { matchIdentity, matchLabel, type TbaMatch } from "./match-analysis";
import { cleanTbaEventKey, fetchTbaMatches } from "./tba.server";

const API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn";
const DEFAULT_FEISHU_HOST = "https://nirobotics.feishu.cn";
const MAX_WIKI_NODES = 500;
const MAX_WIKI_DEPTH = 5;

export type MatchVideoLink = {
  title: string;
  url: string;
};

type WikiNode = {
  node_token?: string;
  obj_token?: string;
  obj_type?: string;
  title?: string;
  has_child?: boolean;
  url?: string;
};

type VideoEntry = {
  title: string;
  url: string;
  path: string[];
};

type VideoIndexResult = {
  videos: Record<string, MatchVideoLink[]>;
  error?: string;
};

export async function loadMatchVideosForEvent(eventKey: string | null): Promise<VideoIndexResult> {
  const cleanEventKey = cleanTbaEventKey(eventKey);
  if (!cleanEventKey) return { videos: {} };

  const rootToken = videoLibraryNodeToken();
  if (!rootToken) return { videos: {} };

  try {
    const [matches, entries] = await Promise.all([fetchTbaMatches(cleanEventKey), fetchVideoEntries(rootToken)]);
    return { videos: indexVideoEntries(entries, matches) };
  } catch (error) {
    return { videos: {}, error: error instanceof Error ? error.message : "读取飞书视频库失败" };
  }
}

export function indexVideoEntries(entries: VideoEntry[], matches: TbaMatch[]): Record<string, MatchVideoLink[]> {
  const output: Record<string, MatchVideoLink[]> = {};
  for (const match of matches) {
    const links = entries
      .filter((entry) => entryMatchesTbaMatch(entry, match))
      .map((entry) => ({ title: entry.title, url: entry.url }));
    if (links.length) output[matchIdentity(match)] = dedupeLinks(links);
  }
  return output;
}

function entryMatchesTbaMatch(entry: VideoEntry, match: TbaMatch) {
  const text = normalizeText([...entry.path, entry.title].join(" "));
  const key = normalizeText(match.key);
  if (key && text.includes(key)) return true;

  const level = String(match.comp_level ?? "qm").toLowerCase();
  const matchNumber = match.match_number ?? 0;
  const setNumber = match.set_number ?? 0;
  if (!matchNumber) return false;

  return matchPatterns(level, matchNumber, setNumber, matchLabel(match)).some((pattern) => pattern.test(text));
}

function matchPatterns(level: string, matchNumber: number, setNumber: number, label: string) {
  const boundaryStart = "(^|[^a-z0-9])";
  const boundaryEnd = "([^a-z0-9]|$)";
  const number = `0*${matchNumber}`;
  const set = `0*${setNumber || matchNumber}`;
  const escapedLabel = escapeRegExp(normalizeText(label)).replace(/\\-/g, "[-\\s]*");

  if (level === "qm") {
    return [
      new RegExp(`${boundaryStart}q\\s*${number}${boundaryEnd}`),
      new RegExp(`${boundaryStart}qm\\s*${number}${boundaryEnd}`),
      new RegExp(`${boundaryStart}qual(?:ification)?\\s*${number}${boundaryEnd}`),
      new RegExp(`资格赛\\s*${number}`),
      new RegExp(`${boundaryStart}${escapedLabel}${boundaryEnd}`),
    ];
  }

  if (level === "f") {
    return [
      new RegExp(`${boundaryStart}f\\s*${number}${boundaryEnd}`),
      new RegExp(`${boundaryStart}finals?\\s*${number}${boundaryEnd}`),
      new RegExp(`决赛\\s*${number}`),
      new RegExp(`${boundaryStart}${escapedLabel}${boundaryEnd}`),
    ];
  }

  const prefix = level === "sf" ? "sf|semi(?:final)?" : level === "qf" ? "qf|quarter(?:final)?" : "ef|elim(?:ination)?";
  return [
    new RegExp(`${boundaryStart}(?:${prefix})\\s*${set}[-\\s]*${number}${boundaryEnd}`),
    new RegExp(`${boundaryStart}(?:${prefix})\\s*${number}${boundaryEnd}`),
    new RegExp(`${boundaryStart}${escapedLabel}${boundaryEnd}`),
  ];
}

function dedupeLinks(links: MatchVideoLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.title}:${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchVideoEntries(rootToken: string): Promise<VideoEntry[]> {
  const token = await tenantAccessToken();
  const root = await getWikiNode(token, rootToken);
  const rootNodeToken = root.node_token || rootToken;
  const spaceId = String((root as { space_id?: string }).space_id ?? "");
  if (!spaceId || !rootNodeToken) return [];

  const entries: VideoEntry[] = [];
  const queue: Array<{ nodeToken: string; path: string[]; depth: number }> = [{
    nodeToken: rootNodeToken,
    path: [String(root.title || "视频库")],
    depth: 0,
  }];

  while (queue.length && entries.length < MAX_WIKI_NODES) {
    const current = queue.shift();
    if (!current || current.depth >= MAX_WIKI_DEPTH) continue;
    const children = await listWikiChildren(token, spaceId, current.nodeToken);
    for (const child of children) {
      const title = String(child.title || "未命名视频");
      const nodeToken = child.node_token || "";
      const path = [...current.path, title];
      if (isVideoLikeNode(child, title)) {
        const fallbackUrl = wikiUrl(nodeToken || child.obj_token || "");
        entries.push({
          title,
          url: safeFeishuUrl(child.url, fallbackUrl),
          path,
        });
      }
      if (nodeToken && child.has_child !== false) queue.push({ nodeToken, path, depth: current.depth + 1 });
      if (entries.length >= MAX_WIKI_NODES) break;
    }
  }

  return entries;
}

async function tenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) throw new Error("未配置飞书应用凭据。");

  const response = await fetch(`${API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json = await response.json() as { code?: number; msg?: string; tenant_access_token?: string };
  if (!json.tenant_access_token) throw new Error(json.msg || "获取飞书 tenant token 失败。");
  return json.tenant_access_token;
}

async function getWikiNode(token: string, nodeToken: string): Promise<WikiNode & { space_id?: string }> {
  const url = new URL(`${API_BASE}/open-apis/wiki/v2/spaces/get_node`);
  url.searchParams.set("token", nodeToken);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json() as { code?: number; msg?: string; data?: { node?: WikiNode & { space_id?: string } } };
  if (json.code && json.code !== 0) throw new Error(json.msg || "读取飞书视频库节点失败。");
  return json.data?.node ?? {};
}

async function listWikiChildren(token: string, spaceId: string, parentNodeToken: string): Promise<WikiNode[]> {
  const nodes: WikiNode[] = [];
  let pageToken = "";

  do {
    const url = new URL(`${API_BASE}/open-apis/wiki/v2/spaces/${spaceId}/nodes`);
    url.searchParams.set("parent_node_token", parentNodeToken);
    url.searchParams.set("page_size", "50");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json() as {
      code?: number;
      msg?: string;
      data?: { items?: WikiNode[]; nodes?: WikiNode[]; page_token?: string; has_more?: boolean };
    };
    if (json.code && json.code !== 0) throw new Error(json.msg || "读取飞书视频库子节点失败。");
    nodes.push(...(json.data?.items ?? json.data?.nodes ?? []));
    pageToken = json.data?.has_more ? json.data?.page_token ?? "" : "";
  } while (pageToken && nodes.length < MAX_WIKI_NODES);

  return nodes;
}

function isVideoLikeNode(node: WikiNode, title: string) {
  const type = String(node.obj_type || "").toLowerCase();
  return type === "file" || /\.(mp4|mov|m4v|webm)$/i.test(title);
}

function videoLibraryNodeToken() {
  return process.env.FEISHU_VIDEO_LIBRARY_NODE_TOKEN || wikiTokenFromUrl(process.env.FEISHU_VIDEO_LIBRARY_URL || "");
}

function wikiTokenFromUrl(value: string) {
  const match = value.match(/\/wiki\/([^/?#]+)/);
  return match?.[1] ?? value.trim();
}

function wikiUrl(nodeToken: string) {
  return nodeToken ? `${DEFAULT_FEISHU_HOST}/wiki/${nodeToken}` : DEFAULT_FEISHU_HOST;
}

function safeFeishuUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".feishu.cn") ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
