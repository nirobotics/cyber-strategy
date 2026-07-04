export type TbaMatch = {
  key?: string;
  comp_level?: string;
  set_number?: number;
  match_number?: number;
  winning_alliance?: string;
  alliances?: {
    red?: { team_keys?: string[]; score?: number };
    blue?: { team_keys?: string[]; score?: number };
  };
};

export async function fetchTbaMatches(eventKey: string): Promise<TbaMatch[]> {
  const apiKey = process.env.TBA_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/matches`, {
    headers: {
      "X-TBA-Auth-Key": apiKey,
      "User-Agent": "cyber-strategy/1.0",
    },
  });
  if (!response.ok) throw new Response("读取 TBA 赛程失败", { status: 502 });
  return (await response.json()) as TbaMatch[];
}

export function cleanTbaEventKey(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[a-z0-9_]+$/i.test(trimmed) ? trimmed : null;
}
