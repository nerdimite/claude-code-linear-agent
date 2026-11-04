# Setup: reproduce the bot in a fresh Linear workspace

Stand up your own instance, in order. Every problem hit while building it is listed at the end, with its fix. Follow it in order. Secrets go in a gitignored `.env`, never in the repo.

To have a coding agent do all of this for you, see the Quick start in the README. It runs `.claude/skills/setup-linear-agent`, which follows these same steps.

## 0. Prerequisites

- A claude.ai **Pro, Max, Team or Enterprise** account with Claude Code on the web enabled. On Team or Enterprise, an Owner must have **Scheduled tasks (Routines)** turned on under Organization settings → Capabilities → Remote sessions.
- GitHub connected to claude.ai, with access to the target repo.
- Linear **workspace admin**, to create the OAuth app.
- Vercel CLI logged in (`npm i -g vercel`, `vercel login`), and access to the target team.
- Local tools: `bun`, `node`, `gh`, `rsvg-convert` (only for the icon).

## 1. Deploy the bot to Vercel first

The cloud session can only report back to a **stable, named HTTPS host**. A tunnel doesn't work (see Troubleshooting T1), so deploy before anything else.

```sh
bun install
vercel link --yes --scope <team-slug> --project claude-code-linear-agent
vercel deploy --prod --yes --scope <team-slug>
curl -sS https://<project>.vercel.app/api/health   # -> {"ok":true}
```

- Use the **production** alias (`https://<project>.vercel.app`). Previews sit behind Vercel Deployment Protection, which blocks both Linear webhooks and session callbacks.
- Deploying from the CLI or from a connected GitHub repo both work.

## 2. Redis (Upstash, from the Vercel Marketplace)

```sh
vercel integration add upstash/upstash-kv --name claude-code-linear-agent-kv --scope <team-slug>
```

- The first run returns `integration_terms_acceptance_required` with a URL. A human must accept the marketplace terms there; then rerun the command.
- It connects `KV_REST_API_URL` and `KV_REST_API_TOKEN` to every environment. To get them locally: `vercel env pull .env.vercel --environment=development`, then copy them into `.env`.

## 3. Bot secrets

Generate them and add them to `.env` and to Vercel production:

```sh
BOT_SIGNING_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')
CRON_SECRET=$(openssl rand -hex 24)
```

`PUBLIC_BASE_URL` is the production URL from step 1, with no trailing slash. Also set:

- `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`): encrypts each person's routine token at rest
- `IDLE_WINDOW_MINUTES` (default 60; 0 turns it off) and `WAIT_SECONDS` (default 100): same-session follow-up window and wait-call length
- `DEFAULT_REPOSITORY` (required, for example `your-org/your-repo`) and `DEFAULT_BASE_BRANCH` (default `main`)

## 4. Linear OAuth app

Go to Linear → Settings → API → OAuth applications → **New**:

| Field | Value |
|---|---|
| Application name | `Claude Code`. Every member of the workspace sees this name. |
| Developer name / URL | your name / the production URL |
| Redirect URIs | `<PUBLIC_BASE_URL>/api/linear/callback` and `<PUBLIC_BASE_URL>/api/auth/linear/callback` (the second is the connect page's sign-in) |
| Client credentials | **On**. The bot mints its own token this way (step 5). |
| Webhooks | On. URL `<PUBLIC_BASE_URL>/api/linear/webhook`, event **Agent session events** only |
| Public | Off |

- Copy the **webhook signing secret** while the create form still shows it.
- Copy the **client ID and secret** after saving.
- Put all three in `.env` and in Vercel production as `LINEAR_WEBHOOK_SECRET`, `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`.
- Turning on agent session events makes the agent UI appear for everyone in the workspace straight away.

**Icon (optional):** the Application icon must be at least 256×256 px. The repo ships `public/bot-icon.png`: the Claude symbol (CC0 on Wikimedia Commons), scaled to 80% with padding on a transparent background, because Linear crops icons to a circle.

## 5. App token, with no browser install

The bot calls the `client_credentials` grant itself on first use (`lib/linear.ts`), with scopes `read,write,app:assignable,app:mentionable`. To check the app user exists:

```sh
curl -sS -X POST https://api.linear.app/oauth/token -u "$LINEAR_CLIENT_ID:$LINEAR_CLIENT_SECRET" \
  -d 'grant_type=client_credentials&scope=read,write,app:assignable,app:mentionable'
```

Only mint by hand **once**, with **all four scopes**, and then write the token into Redis yourself (see Troubleshooting T4), or the bot's token dies.

## 6. Each person connects their Claude account (self-serve)

Send people to `<PUBLIC_BASE_URL>/connect`:

1. **Continue with Linear.** A read-only Linear sign-in tells the agent who they are. The token is revoked right after. Only workspaces where the app has a token (step 5) can sign in.
2. **Create a scheduled task** at claude.ai/code/routines (New task → Set up manually):

   | Field | Value |
   |---|---|
   | Model | Opus, set explicitly ("Default" ran Sonnet in testing) |
   | Repository | the repos issues will touch |
   | Connectors | Linear only; issue text is written by other people |
   | Instructions | the text on the connect page (`lib/routine-prompt.ts`), pasted exactly |
   | Trigger | API. The token is shown **once**, together with the fire URL. |

3. **Paste the fire URL and token** into the page. The token is stored AES-256-GCM encrypted in Redis (`routine:<linear-user-id>`).
4. **Test connection** (optional). This starts one no-op session that calls back to `/api/runs/<id>/events`. It passes in about 50 seconds.

The page shows **Connected** as soon as credentials are saved. Disconnect deletes them.

**Auto-mode rules aren't needed.** Naming the agent's host in the saved instructions is enough for the safety check to allow the callbacks.

`ROUTINES_JSON` (keyed by Linear user id) still works as an admin fallback when nothing is stored in Redis. It's empty in production.

## 7. Smoke tests (in this order)

Create throwaway issues assigned to yourself and **delegated** to the bot. Cancel them afterwards, and close any PRs and delete their branches.

1. **Fire only:** `curl` the fire URL with a harmless `text`, then open the returned `claude_code_session_url` to watch it. This proves the token works and the payload opt-in is respected.
2. **Reachability:** a fire whose text asks the session to `curl -X POST <PUBLIC_BASE_URL>/api/health` with `{"type":"thought","body":"probe"}`. Expect `HTTP 200`. If auto mode refuses it, see T1.
3. **No-change run:** plan, then an action, then done. Check the Linear session shows the plan, the session link, a response, and **In Progress**.
4. **Elicitation:** the session asks a question and ends; you reply in the thread, and a continuation run starts and finishes.
5. **Same-session follow-up:** after a run sends done, reply in the thread within the idle window. Expect "Picked up your follow-up in the same session", an answer within seconds, and still only one session link.
6. **Live follow-up:** the session sleeps at checkpoints; reply mid-run. Expect "Passed your message to the running session", and the session acting on it.
7. **Stop:** send a stop from Linear, or replay a signed `prompted` webhook with `agentActivity.signal = "stop"`. The next callback returns 410 and the session halts.
8. **PR:** a docs-only change. Check:
   - base `DEFAULT_BASE_BRANCH`
   - one changed file
   - a `feat/` or `fix/` branch
   - `Fixes <ID>` in the description
   - **no** "Generated by Claude Code" footer
   - a verified signature on the commit, if your repo requires signed commits (cloud session commits are signed)

Debug Linear **with the stored token**: read `install:<org-id>` from Upstash REST (`GET $KV_REST_API_URL/get/install:<org>`). **Don't mint new tokens to debug** (see T4).

## Troubleshooting (every issue hit during setup)

**T1. The callback curl is denied with "Exfil Scouting".**
- The cloud session's auto-mode safety check refused `curl -X POST` to a `*.trycloudflare.com` tunnel. It did so even though the routine prompt trusts the payload.
- Fix:
  - use the stable production host
  - name that host in the routine's saved prompt, as the intended reporting channel
  - the `auto_mode_allow` / `auto_mode_environment` rules turned out to be unnecessary (retested without them; the probe passed)
- After that, POSTs to `*.vercel.app` passed on the **Default** environment; no allowlist edit was needed.
- The session-to-bot leg can't be tested locally.

**T2. Only the first delegation reached the bot; later ones went stale.**
- Linear's `webhookId` is the **subscription** id, the same for every delivery, so deduping on it dropped every later event.
- The bot now dedupes on `action:agentSession.id:agentActivity.id`.

**T3. Every callback returned 502 "failed to relay to Linear" (Linear 401).**
- Each `client_credentials` mint **revokes the previous token**. Hand-minted debug tokens killed the bot's stored one.
- The bot now re-mints once on a 401.

**T4. "One or more app users lack the required capability" when delegating.**
- The **newest mint's scopes become the app's capabilities**. A debug mint with `scope=read` made the app unassignable.
- Fix: mint once with all four scopes, then write the result to Redis yourself:

```python
inst = {"organizationId": org, "appUserId": app_user_id, "accessToken": token, "expiresAt": now_ms + expires_in * 1000}
# POST $KV_REST_API_URL/set/install:<org>  body=json.dumps(inst)  header Authorization: Bearer $KV_REST_API_TOKEN
```

**T5. The PR targeted the wrong base branch and pulled in hundreds of unrelated commits.**
- "The default branch" was ambiguous to the session.
- The protocol now names the base explicitly (`DEFAULT_BASE_BRANCH`).

**T6. The PR description ended with "Generated by Claude Code" plus a session link.**
- Claude Code's GitHub tool appends this footer server-side, even when the body sent has none.
- The protocol makes the session read the PR back and edit the footer out. Testing confirmed it works.

**T7. Runs used Sonnet.**
- The routine's model was "Default". Set it explicitly through the API (step 6).

**T8. Re-delegating an issue didn't start a new session.**
- Un-delegating and re-delegating reuses the existing (stale) agent session, and no `created` webhook fires.
- Use a fresh issue, or reply in the session thread (which sends `prompted`).

**T9. A single delegation never produced a webhook.**
- This happened once, during a GitHub/Linear incident window; the next one worked.
- If a session sits at "pending" with no bot activity, check the Linear app's *Webhook delivery failures* list, then delegate again on a new issue.

**T11. `vercel integration add` reports `action_required`.**
- Marketplace terms need a human to accept them in the browser; rerun the command afterwards.

**T12. Your repo requires signed commits or PR approval.**
- Cloud session commits come out signed and verified, so a signed-commits ruleset is satisfied. PR-approval rules don't affect the agent, which only opens PRs.

**T13. Each Claude task run is titled "⚡ Linear dispatch".**
- The fire API has no title field. Rename sessions by hand in claude.ai, or open them from the link in Linear.

**T15. The connect page's sign-in sends you back with "Couldn't sign you in".**
- `state`: the sign-in link expired or the cookie was lost. Start again.
- `workspace`: the app has no token for that Linear workspace yet (step 5).
- `linear`: the token exchange failed. Check `/api/auth/linear/callback` is in the app's redirect URIs.

**T14. (Fixed) Following up directly in the claude.ai chat after the run finished.**
- Used to get 410 (stop). A finished or idle run that reports again now reopens, and its next wait call returns it to the idle window. Only a Linear stop returns 410.

**T16. Same-session follow-ups need the session to keep waiting.**
- The routine fire API can't message an existing session. So after done (or a question), the session long-polls `/api/runs/<id>/wait` for `IDLE_WINDOW_MINUTES`. The saved instructions name that wait URL as part of the reporting channel; the safety check allowed the repeated calls in testing.
- Each wait call holds for `WAIT_SECONDS` (default 100), because Claude Code's Bash tool times out at 2 minutes by default.
