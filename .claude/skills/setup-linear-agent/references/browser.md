# Browser recipes

The setup touches three sites: Linear (OAuth app), claude.ai (scheduled task) and the deployed app (`/connect`). This file covers how to drive each browser tool, then what to do on each page. Page layouts change; when a selector below doesn't match, take a fresh snapshot and find the field by its visible label.

## Driving each tool

**Claude in Chrome** (`mcp__claude-in-chrome__*`)
- The person's own Chrome, already signed in. Best choice.
- Call `tabs_context_mcp` first, then work in a new tab (`tabs_create_mcp`) and close it at the end.
- Each site may need a one-time permission from the person; if a call waits on that, tell them and wait.
- Don't click anything that opens a native `confirm()` dialog: it freezes the extension.
- Use `form_input` for fields, `read_page` for values, and `javascript_tool` for the icon upload and for reading secrets out of the DOM.

**Traycer in-app browser** (`traycer-browser` `repl`)
- Carries the person's sessions. `page.listSessions()` / `page.attachTab({tabId})` to reuse an open Linear or claude.ai tab; otherwise `page.openSession({profile: "primary", initialUrl})`.
- It may refuse to navigate to a new site. Then either ask the person to open the tab themselves, or move within an already-open site with same-origin navigation:
  ```js
  await page.evaluate(p => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, '/<slug>/settings/api/applications/new')
  ```
- `page.snapshot({interactive: true})` gives refs (`e42`) for `page.fill` / `page.click`. Refs change after every snapshot.

**Playwright MCP, or computer use**
- A clean profile with no sign-ins. Open `https://linear.app/login` and `https://claude.ai/login` and ask the person to sign in in that window, then continue.
- Playwright's `browser_file_upload` can upload `public/bot-icon.png` straight from disk.

**No browser**
- Print the exact steps and values for the page (the tables in SKILL.md), ask the person to do them, and ask them to paste back only what you need (secrets go into `.env` by you, not echoed back).

## Uploading the icon without a file picker

The deployed app serves `/bot-icon.png` with `Access-Control-Allow-Origin: *` (see `vercel.json`) for exactly this. Run in the Linear page's context:

```js
const bytes = Array.from(new Uint8Array(await (await fetch('<base>/bot-icon.png')).arrayBuffer()))
// then, in the page:
const input = document.querySelector('input[type=file]')
const file = new File([new Uint8Array(bytes)], 'claude-code.png', { type: 'image/png' })
const dt = new DataTransfer(); dt.items.add(file)
input.files = dt.files
input.dispatchEvent(new Event('input', { bubbles: true }))
input.dispatchEvent(new Event('change', { bubbles: true }))
```

If the page script can fetch directly, do it all in one `evaluate`. Check the icon preview appears before saving.

## Linear: create the OAuth app

URL: `https://linear.app/<slug>/settings/api/applications/new` (Settings, API, OAuth applications, New). Needs a workspace admin.

| Field | How it's labelled (as of writing) |
|---|---|
| Application name | textbox "Application name" |
| Developer name | textbox "Developer name" |
| Developer URL | input with placeholder `https://bugreporter.com/linear-app` |
| Callback URLs | textarea with placeholder starting `https://bugreporter.com/callback`; one URL per line |
| Client credentials | a checkbox/toggle labelled "Client credentials" |
| Webhooks | toggle; then URL input with placeholder `https://example.com/webhook` |
| Webhook events | checkboxes; tick only **Agent session events** (`page.getByText('Agent session events', {exact: true})`) |
| Public | leave off |
| Icon | `input[type=file]` near the top (see above) |

Before saving, verify by reading values back:

```js
[...document.querySelectorAll('input,textarea')].filter(i => i.type !== 'checkbox' && i.type !== 'file').map(i => [i.placeholder || i.getAttribute('aria-label'), i.value])
```

**The webhook signing secret is shown on the create form, near the webhook URL.** Read it and store it as `LINEAR_WEBHOOK_SECRET` before you click Create/Save. After saving you land on the app page (`/settings/api/applications/<uuid>`), which shows the client ID and a client secret (reveal or copy if masked). The edit page is that URL plus `/edit`.

Saving with agent session events on makes the agent appear to everyone in the workspace immediately.

## claude.ai: create the scheduled task

URL: `https://claude.ai/code/routines`. Start a new task and pick the manual setup option. The dialog ("New scheduled task") has tabs; field names as of writing:

- **General:** name, instructions (paste the `routine-prompt.ts` output exactly), a "Repository" combobox, a model picker, a "Cloud environment" combobox.
- **Trigger:** choose **API**. The token is generated on Create.
- **Connectors:** a list with a "Remove <name>" button per item. Keep Linear only, unless the person wants others.
- **Notifications:** optional (push, Slack).
- An "Auto-fix pull requests" switch.

Read the whole dialog back before clicking Create; another hand on the same tab can change it:

```js
const d = [...document.querySelectorAll('[role=dialog]')].find(x => /scheduled task/i.test(x.textContent))
return {
  inputs: [...d.querySelectorAll('input,textarea,[contenteditable=true]')].map(i => [i.getAttribute('aria-label') || i.placeholder, (i.value ?? i.textContent).slice(0, 80)]),
  combos: [...d.querySelectorAll('[role=combobox]')].map(b => `${b.getAttribute('aria-label')} = ${b.textContent.trim()}`),
  switches: [...d.querySelectorAll('[role=switch],[role=checkbox]')].map(b => `${b.getAttribute('aria-label')} = ${b.getAttribute('aria-checked')}`),
}
```

After **Create**, a dialog shows the API token (`sk-ant-oat01-...`) **once**. Read it out of the dialog's text or code element and write it to `.env` immediately, before closing the dialog. The task page URL is `https://claude.ai/code/routines/<trig_id>`.

## The app: /connect

URL: `<base>/connect`. Click **Continue with Linear**, approve the read-only consent on Linear, and you return signed in. Fill the fire URL and token fields, save, and the panel shows **Connected**. **Test connection** starts one no-op session; wait for it to report back (about a minute) and read the result off the panel. If sign-in returns "Couldn't sign you in", the reason code is in SETUP.md T15.
