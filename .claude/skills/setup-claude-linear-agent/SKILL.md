---
name: setup-claude-linear-agent
description: Set up this repository end to end, autonomously - Vercel project and deploy, Upstash Redis, secrets, the Linear OAuth app (with icon), the app token, the person's Claude Code task (routine) and the /connect step, then a live test. Use when someone says "set this up", "/setup-claude-linear-agent", "deploy the Linear agent", "connect my Claude account", or "add a teammate". Pass "connect" to only connect one more person to an existing deployment.
---

# Set up the Claude Code Linear Agent

You set up this repo for a person's own Linear workspace, doing every step yourself where you have the tools, and pausing only for the few things a human must do. Each phase checks whether it is already done first, so rerunning the skill resumes instead of repeating work.

`SETUP.md` is the human runbook and has the troubleshooting list (T1-T16). This skill is the same procedure for an agent. Read `references/browser.md` before the first browser step.

**Modes**
- `full` (default): phases 0-8.
- `connect`: an existing deployment, one more person. Ask for the production URL, then do phases 7-8 only.

## Rules

- **Secrets stay out of chat.** Write every secret straight into `.env` (gitignored, mode 600) with `scripts/lib.sh`'s `env_set` or the scripts below. Never echo a secret, token or key in a reply, a commit, or a command argument where you can use stdin instead.
- **Never mint a second Linear app token** (`client_credentials`). Each mint revokes the last one and resets the app's scopes (T3, T4). `linear-install.mjs` refuses if a token already exists; don't pass `--force` unless the stored one is known dead.
- **Ask before outward or billable steps** that the consent gate in phase 1 didn't cover, and before accepting any terms on the person's behalf.
- **No commits are needed.** Setup changes nothing tracked. If you do commit or open a PR, add no AI attribution (no `Co-Authored-By` trailer, no "Generated with" footer).
- **Stop and ask** after 2-3 failed attempts at the same browser action, and say what you tried.

Script paths below are relative to the repo root: `S=.claude/skills/setup-claude-linear-agent/scripts`.

## Phase 0: preflight

1. Run `$S/check.sh`. It shows which tools are missing and which phases are already done. Skip every phase it marks done.
2. Missing tools: `bun`, `node`, `vercel` (`npm i -g vercel`), `gh`, `openssl`, `curl`. Install what you can; if `vercel whoami` fails, ask the person to run `! vercel login`.
3. Run `bun install`.
4. **Optional, Claude Code only:** if the Vercel plugin isn't installed, run `claude plugin install vercel@claude-plugins-official`. It loads on the next restart, so nothing below depends on it; the Vercel CLI does all the work.
5. **Find a browser tool**, in this order of preference (details in `references/browser.md`):
   1. Claude in Chrome (`mcp__claude-in-chrome__*`, or `enable__mcp__claude-in-chrome` to turn it on): the person's real Chrome, already signed in.
   2. Another in-app browser with the person's sessions (for example Traycer's `repl`).
   3. Playwright MCP or computer use: a fresh browser; the person signs in to Linear and claude.ai in it once.
   4. None: you will print exact click-by-click steps for the human parts and wait for them to paste values back.
6. Check the person is signed in where you need them: open `https://linear.app` and `https://claude.ai/code` and read who is signed in. Linear needs a **workspace admin**.

## Phase 1: inputs and one consent gate

Collect these in a single question round (infer what you can first):

| Input | How to infer | Default |
|---|---|---|
| Vercel scope (team slug) | `vercel teams ls` | ask if more than one |
| Vercel project name | it becomes `<name>.vercel.app` | `claude-code-linear-agent` |
| Linear workspace slug | the URL after signing in, `linear.app/<slug>/...` | - |
| Default repository | `gh repo list`, or ask | required, `owner/repo` |
| Base branch for PRs | `gh repo view <repo> --json defaultBranchRef` | that repo's default |
| Agent name in Linear | - | `Claude Code` |

Then show the person **one list of everything you will create** and get a single go-ahead:
- a Vercel project in that scope, with a production deploy (the watchdog cron every 5 minutes needs a **Pro** plan)
- an Upstash Redis database from the Vercel Marketplace (free tier), whose terms someone must accept once
- a private Linear OAuth app, which **every member of the workspace** sees as an agent as soon as it's saved
- a Claude Code scheduled task (routine) on their claude.ai account, with an API trigger

## Phase 2: Vercel project and first deploy

Deploy first: the cloud session can only call back to a stable public host (T1), so the URL must exist before anything else.

```sh
vercel link --yes --scope <scope> --project <name>
bun run deploy -- <scope>       # scripts/deploy.sh: deploys HEAD from a clean export, no git metadata
```

- `deploy.sh` needs a clean working tree. A fresh clone is clean; `.env` is gitignored.
- Find the **production** URL from the deploy output, or `vercel project inspect <name> --scope <scope>`. Don't assume `<name>.vercel.app`; a taken name gets a suffix. Never use a preview URL: Deployment Protection blocks webhooks and callbacks.
- `curl -s <url>/api/health` must return `{"ok":true}`. Env vars aren't needed yet; they're read lazily.
- Save it: `source $S/lib.sh && env_set PUBLIC_BASE_URL https://<host>` (no trailing slash).
- **Hobby plan:** the deploy fails on the `*/5` cron. Tell the person, and offer to change `vercel.json` to a daily schedule (`0 9 * * *`). The quiet-session watchdog then runs once a day. Changing it means a commit, because `deploy.sh` deploys HEAD.

## Phase 3: Redis

```sh
vercel integration add upstash/upstash-kv --name <name>-kv --scope <scope>
```

- If it returns `integration_terms_acceptance_required` or `action_required` (T11), open the URL it prints in the browser and ask the person to accept the terms (or accept them yourself only if they told you to). Then rerun the command.
- It connects `KV_REST_API_URL` and `KV_REST_API_TOKEN` to every environment and pulls them into a local env file. Copy both into `.env` (`env_set`). If they weren't pulled: `vercel env pull .env.vercel --environment=development --yes`, copy, then delete `.env.vercel`.

## Phase 4: secrets and defaults

```sh
$S/gen-secrets.sh                 # BOT_SIGNING_SECRET, TOKEN_ENCRYPTION_KEY, CRON_SECRET, IDLE_WINDOW_MINUTES, WAIT_SECONDS, ROUTINES_JSON
source $S/lib.sh && env_set DEFAULT_REPOSITORY owner/repo && env_set DEFAULT_BASE_BRANCH <branch>
$S/push-env.sh                    # every app key that has a value -> Vercel production
```

Don't redeploy yet; phase 5 adds three more keys.

## Phase 5: the Linear OAuth app

In the browser, open `https://linear.app/<slug>/settings/api/applications/new` and fill the form (field-by-field recipe in `references/browser.md`):

| Field | Value |
|---|---|
| Application name | the agent name (`Claude Code`) |
| Developer name / URL | the person's name / `PUBLIC_BASE_URL` |
| Callback URLs (one per line) | `<base>/api/linear/callback` and `<base>/api/auth/linear/callback` |
| Client credentials | on |
| Webhooks | on; URL `<base>/api/linear/webhook`; events: **Agent session events** only |
| Public | off |
| Icon | `public/bot-icon.png` (Linear needs at least 256x256; this one is 512 and pre-padded for the circle crop) |

1. **Read the webhook signing secret off the create form before you save.** Write it to `.env` as `LINEAR_WEBHOOK_SECRET`.
2. Save. On the app's page, read the **client ID** and **client secret** (click reveal or copy if it's masked) into `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`.
3. If the icon didn't upload during create, open the app's edit page and upload it there.
4. `$S/push-env.sh LINEAR_CLIENT_ID LINEAR_CLIENT_SECRET LINEAR_WEBHOOK_SECRET`, then `bun run deploy -- <scope>` (env changes only reach a new deployment). Check `/api/health` again.

No browser? Print the table above and ask the person to create the app and paste the three values; write them to `.env` yourself.

## Phase 6: the app token

```sh
node $S/linear-install.mjs
```

It mints one token with all four scopes and stores it in Redis as `install:<org>`. The `/connect` sign-in needs it (otherwise T15 `workspace`), and without it the agent can't be assigned. It prints the workspace and the app user; check the workspace slug matches.

Fallback if minting fails: open `<base>/api/linear/install` in the browser and have the admin approve. That stores an OAuth install with a refresh token through the same record.

## Phase 7: the person's Claude Code task

Get the exact instructions to paste (the same text `/connect` shows):

```sh
bun $S/routine-prompt.ts "$(source $S/lib.sh && env_get PUBLIC_BASE_URL)"
```

In the browser, open `https://claude.ai/code/routines`, start a **new task** and choose **set up manually**:

| Field | Value |
|---|---|
| Name | `Linear dispatch` (every session gets this title, T13) |
| Instructions | the printed text, exactly |
| Repository | `DEFAULT_REPOSITORY`, plus any other repo issues may touch |
| Model | **Opus, chosen explicitly.** "Default" ran Sonnet (T7) |
| Environment | Default |
| Connectors | Linear only. Remove the others: issue text comes from other people |
| Trigger | **API** |
| Auto-fix pull requests | ask the person; on is fine |

1. Click **Create**. A dialog shows the **token once**. Read it from the page and write it straight to `.env` as `ROUTINE_TOKEN` before closing the dialog.
2. Read the task id (`trig_...`) from the URL or the trigger panel. Write `ROUTINE_FIRE_URL=https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire` to `.env`.
3. If you have a `RemoteTrigger` tool, `get` the trigger and confirm its model is Opus; if not, `update` it with `{"model": "<opus model id>"}`.

These two `ROUTINE_*` keys are only for phase 8; the app never reads them from env. Don't push them.

## Phase 8: connect and test

1. Open `<base>/connect`, click **Continue with Linear** and approve (read-only sign-in).
2. Paste the fire URL and token, save. The page shows **Connected**.
3. Click **Test connection**. It starts a no-op session that reports back; it passes in about a minute. This is the end-to-end proof: fire, session, callback.
4. If it fails, the page shows why. A refused callback in the session log is T1 (wrong host in the instructions). A 401 on fire means a wrong or old token.
5. Remove `ROUTINE_TOKEN` from `.env` once connected if the person prefers (it's stored encrypted in Redis now).

**Optional live smoke, only with the person's OK:** create a throwaway issue, delegate it to the agent, and ask for a tiny docs change. Expect a plan, a session link, the issue moving to In Progress, and a PR against `DEFAULT_BASE_BRANCH` with `Fixes <ID>`. Then cancel the issue, close the PR and delete its branch.

## Finish

Run `$S/check.sh` and show its output. Then tell the person:
- the production URL and the `/connect` link to send teammates (each one runs this skill with `connect`, or follows the page)
- that future deploys are `bun run deploy -- <scope>`
- where the secrets are (`.env`), and that it must never be committed
- anything that was skipped, and why
