const keys = [
  "CF_STRATEGY_ACCOUNT_ID", "CF_STRATEGY_WORKER", "CF_STRATEGY_ORIGIN", "CF_STRATEGY_ZONE", "CF_STRATEGY_D1_ID",
  "CF_STRATEGY_D1_NAME", "CF_STRATEGY_R2", "CF_STRATEGY_SCOUT_WORKER", "CF_STRATEGY_SCOUT_ORIGIN", "CF_STRATEGY_PIT_ORIGIN",
] as const;

type Key = typeof keys[number];

export function deploymentIdentity(env: NodeJS.ProcessEnv, required = false) {
  const values = Object.fromEntries(keys.map((key) => [key, env[key]?.trim()])) as Record<Key, string | undefined>;
  const missing = keys.filter((key) => !values[key]);
  const configured = missing.length === 0;
  if ((required || missing.length !== keys.length) && !configured) throw new Error("Missing Cloudflare deployment settings: " + missing.join(", "));
  const identity = {
    accountId: values.CF_STRATEGY_ACCOUNT_ID ?? "00000000000000000000000000000000",
    name: values.CF_STRATEGY_WORKER ?? "cyber-strategy-template",
    origin: values.CF_STRATEGY_ORIGIN ?? "https://strategy-template.example.invalid",
    zone: values.CF_STRATEGY_ZONE ?? "example.invalid",
    databaseId: values.CF_STRATEGY_D1_ID ?? "00000000-0000-0000-0000-000000000000",
    databaseName: values.CF_STRATEGY_D1_NAME ?? "cyber-strategy-template",
    bucket: values.CF_STRATEGY_R2 ?? "cyber-strategy-template",
    scout: { worker: values.CF_STRATEGY_SCOUT_WORKER ?? "cyber-scout-template", origin: values.CF_STRATEGY_SCOUT_ORIGIN ?? "https://scout-template.example.invalid" },
    pitOrigin: values.CF_STRATEGY_PIT_ORIGIN ?? "https://pit-template.example.invalid",
  };
  if (configured) {
    const origins = [identity.origin, identity.scout.origin, identity.pitOrigin];
    if (origins.some((origin) => !/^https:\/\/[a-z0-9.-]+$/.test(origin) || origin.endsWith(".invalid"))) throw new Error("Cloudflare origins must be HTTPS hostnames");
    if (!identity.origin.endsWith("." + identity.zone) && identity.origin !== "https://" + identity.zone) throw new Error("Strategy origin must belong to the configured Cloudflare zone");
    if (identity.name === "cyber-strategy" || identity.origin === "https://strategy.team8214.com" || identity.bucket === "cyber-strategy" || identity.databaseId === "f31e6a3a-ec11-4ba6-9819-9b53983a40c0") {
      throw new Error("The season template must use its own Strategy Worker, host, R2 bucket and D1 database");
    }
  }
  return identity;
}

export const deploymentKeys = keys;
