#!/usr/bin/env node
// Seeds the bot's Linear app token into Redis, so /connect sign-in works before the first delegation.
//
//   node linear-install.mjs --status   reports whether an install:<org> record exists (mints nothing)
//   node linear-install.mjs            mints ONE client_credentials token with all four scopes and stores it
//   node linear-install.mjs --force    same, even if a record exists
//
// Why it refuses by default: every client_credentials mint revokes the previous token, and the newest
// mint's scopes become the app's capabilities (SETUP.md T3/T4). Never mint just to debug.
// Reads LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, KV_REST_API_URL, KV_REST_API_TOKEN from ENV_FILE (default <repo>/.env).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPES = "read,write,app:assignable,app:mentionable";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const envFile = process.env.ENV_FILE ?? resolve(root, ".env");
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
const need = (k) => env[k] || process.env[k] || fail(`Missing ${k} in ${envFile}`);
function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const kvUrl = need("KV_REST_API_URL");
const kvToken = need("KV_REST_API_TOKEN");
async function redis(cmd) {
  const res = await fetch(kvUrl, { method: "POST", headers: { Authorization: `Bearer ${kvToken}` }, body: JSON.stringify(cmd) });
  const json = await res.json();
  if (!res.ok || json.error) fail(`Redis error: ${json.error ?? res.status}`);
  return json.result;
}
async function scan(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis(["SCAN", cursor, "MATCH", pattern, "COUNT", "200"]);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== "0");
  return keys;
}

const args = new Set(process.argv.slice(2));
const installs = await scan("install:*");
if (args.has("--status")) {
  const routines = await scan("routine:*");
  console.log(JSON.stringify({ installs: installs.length, connectedUsers: routines.length }));
  process.exit(0);
}
if (installs.length && !args.has("--force")) {
  console.log(`An install record already exists (${installs.join(", ")}). Not minting. Pass --force to replace it.`);
  process.exit(0);
}

const tokenRes = await fetch("https://api.linear.app/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPES,
    client_id: need("LINEAR_CLIENT_ID"),
    client_secret: need("LINEAR_CLIENT_SECRET"),
  }),
});
if (!tokenRes.ok) fail(`Linear token mint failed: ${tokenRes.status} ${await tokenRes.text()}`);
const t = await tokenRes.json();

const me = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.access_token}` },
  body: JSON.stringify({ query: "query { viewer { id name organization { id name urlKey } } }" }),
}).then((r) => r.json());
const viewer = me.data?.viewer ?? fail(`Linear viewer query failed: ${JSON.stringify(me.errors)}`);

const install = {
  organizationId: viewer.organization.id,
  appUserId: viewer.id,
  accessToken: t.access_token,
  ...(t.expires_in ? { expiresAt: Date.now() + t.expires_in * 1000 } : {}),
};
await redis(["SET", `install:${install.organizationId}`, JSON.stringify(install)]);
console.log(
  JSON.stringify({ stored: `install:${install.organizationId}`, workspace: viewer.organization.urlKey, appUser: viewer.name, appUserId: viewer.id }),
);
