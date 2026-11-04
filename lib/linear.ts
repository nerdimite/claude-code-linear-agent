import { env } from "./env";
import { store, type Install } from "./store";

const TOKEN_URL = "https://api.linear.app/oauth/token";
const GRAPHQL_URL = "https://api.linear.app/graphql";

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export async function exchangeToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.linearClientId,
      client_secret: env.linearClientSecret,
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Linear token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function installFromToken(t: TokenResponse, organizationId: string, appUserId: string): Install {
  return {
    organizationId,
    appUserId,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
  };
}

export const APP_SCOPES = "read,write,app:assignable,app:mentionable";

/**
 * Mints an app-actor token with the client_credentials grant (valid 30 days, no refresh token).
 * This is how a private, single-workspace app gets its token without a browser install.
 */
async function mintClientCredentialsToken(organizationId: string): Promise<Install> {
  const t = await exchangeToken({ grant_type: "client_credentials", scope: APP_SCOPES });
  const me = await gqlWithToken<{ viewer: { id: string; organization: { id: string } } }>(
    t.access_token,
    `query { viewer { id organization { id } } }`,
  );
  if (me.viewer.organization.id !== organizationId) {
    throw new Error(`App token is for organization ${me.viewer.organization.id}, not ${organizationId}`);
  }
  const install = installFromToken(t, organizationId, me.viewer.id);
  await store.saveInstall(install);
  return install;
}

async function accessToken(organizationId: string): Promise<string> {
  const install = await store.getInstall(organizationId);
  const expiringSoon = install?.expiresAt !== undefined && install.expiresAt - Date.now() < 60 * 60 * 1000;
  if (install && !expiringSoon) return install.accessToken;
  if (install?.refreshToken) {
    const t = await exchangeToken({ grant_type: "refresh_token", refresh_token: install.refreshToken });
    const refreshed = installFromToken(t, install.organizationId, install.appUserId);
    refreshed.refreshToken ??= install.refreshToken;
    await store.saveInstall(refreshed);
    return refreshed.accessToken;
  }
  return (await mintClientCredentialsToken(organizationId)).accessToken;
}

export async function gqlWithToken<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
  if (res.status === 401 || json.errors?.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR")) {
    throw new LinearAuthError(`Linear rejected the token: ${JSON.stringify(json.errors ?? json)}`);
  }
  if (!res.ok || json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

class LinearAuthError extends Error {}

/**
 * Minting a client_credentials token revokes the previous one, so a stored token can die at any
 * time (another instance re-minted, or someone minted by hand). On a 401, drop it and retry once.
 */
async function gql<T>(organizationId: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  try {
    return await gqlWithToken<T>(await accessToken(organizationId), query, variables);
  } catch (err) {
    if (!(err instanceof LinearAuthError)) throw err;
    console.warn(JSON.stringify({ event: "linear.token_rejected", organizationId }));
    const install = await store.getInstall(organizationId);
    if (install?.refreshToken) throw err;
    return gqlWithToken<T>((await mintClientCredentialsToken(organizationId)).accessToken, query, variables);
  }
}

export type ActivityContent =
  | { type: "thought"; body: string }
  | { type: "elicitation"; body: string }
  | { type: "response"; body: string }
  | { type: "error"; body: string }
  | { type: "action"; action: string; parameter: string; result?: string };

export async function emitActivity(
  organizationId: string,
  agentSessionId: string,
  content: ActivityContent,
  opts: { ephemeral?: boolean } = {},
): Promise<void> {
  await gql(
    organizationId,
    `mutation($input: AgentActivityCreateInput!) { agentActivityCreate(input: $input) { success } }`,
    { input: { agentSessionId, content, ephemeral: opts.ephemeral ?? false } },
  );
}

export type PlanStep = { content: string; status: "pending" | "inProgress" | "completed" | "canceled" };

export async function updateSession(
  organizationId: string,
  agentSessionId: string,
  input: { addedExternalUrls?: { label: string; url: string }[]; plan?: PlanStep[] },
): Promise<void> {
  await gql(
    organizationId,
    `mutation($id: String!, $input: AgentSessionUpdateInput!) { agentSessionUpdate(id: $id, input: $input) { success } }`,
    { id: agentSessionId, input },
  );
}

type IssueStateQuery = {
  issue: {
    state: { type: string };
    team: { states: { nodes: { id: string; position: number }[] } };
  };
};

/** Move the issue to the team's first "started" state unless it is already started, completed or canceled. */
export async function moveToStarted(organizationId: string, issueId: string): Promise<boolean> {
  const data = await gql<IssueStateQuery>(
    organizationId,
    `query($id: String!) { issue(id: $id) { state { type } team { states(filter: { type: { eq: "started" } }) { nodes { id position } } } } }`,
    { id: issueId },
  );
  if (["started", "completed", "canceled"].includes(data.issue.state.type)) return false;
  const first = [...data.issue.team.states.nodes].sort((a, b) => a.position - b.position)[0];
  if (!first) return false;
  await gql(
    organizationId,
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id: issueId, input: { stateId: first.id } },
  );
  return true;
}
