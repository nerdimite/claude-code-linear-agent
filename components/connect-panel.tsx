"use client";

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExternalLink,
  IconKey,
  IconPlayerPlay,
  IconPlugConnectedX,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, Field, Input } from "@/components/ui/primitives";
import type { RoutineStatus } from "@/lib/credentials";

type TestState = { phase: "idle" } | { phase: "running"; runId: string; sessionUrl: string; step: string } | { phase: "passed"; sessionUrl: string } | { phase: "failed"; message: string; sessionUrl?: string };

const ICON = { size: 16, stroke: 1.75 } as const;

function formatDate(ms?: number) {
  return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function ConnectPanel({ initial }: { initial: RoutineStatus }) {
  const [status, setStatus] = useState(initial);
  const [editing, setEditing] = useState(!initial.connected);
  const [fireUrl, setFireUrl] = useState("");
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: "idle" });
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const res = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fireUrl, token }) });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return setErrors(json.errors ?? { form: json.error ?? "Couldn't save." });
    setStatus(json);
    setEditing(false);
    setToken("");
    setFireUrl("");
    setTest({ phase: "idle" });
  }

  async function disconnect() {
    const res = await fetch("/api/connect", { method: "DELETE" });
    if (res.ok) {
      setStatus(await res.json());
      setEditing(true);
      setTest({ phase: "idle" });
    }
  }

  async function runTest() {
    setTest({ phase: "running", runId: "", sessionUrl: "", step: "Starting a session on your Claude account…" });
    const res = await fetch("/api/connect/test", { method: "POST" });
    const json = await res.json();
    if (!res.ok) return setTest({ phase: "failed", message: json.error ?? "Couldn't start the test." });
    setTest({ phase: "running", runId: json.runId, sessionUrl: json.sessionUrl, step: "Session started. Waiting for it to report back (about a minute)…" });
    const started = Date.now();
    poll.current = setInterval(async () => {
      const r = await fetch(`/api/connect/test?runId=${encodeURIComponent(json.runId)}`);
      const s = await r.json();
      if (s.state === "passed") {
        if (poll.current) clearInterval(poll.current);
        setTest({ phase: "passed", sessionUrl: json.sessionUrl });
        setStatus((prev) => ({ ...prev, verifiedAt: Date.now(), lastTestSessionUrl: json.sessionUrl }));
      } else if (s.state === "failed" || Date.now() - started > 5 * 60_000) {
        if (poll.current) clearInterval(poll.current);
        setTest({
          phase: "failed",
          sessionUrl: json.sessionUrl,
          message: "The session didn't report back. Open it to see what happened. The usual cause is a saved prompt that doesn't match the one above.",
        });
      } else if (s.state === "reporting") {
        setTest((prev) => (prev.phase === "running" ? { ...prev, step: "The session reached the agent. Finishing up…" } : prev));
      }
    }, 4000);
  }

  const verified = Boolean(status.verifiedAt);

  return (
    <Card>
      <CardHeader
        title="Your Claude Code task"
        description="The agent starts sessions through this task's API trigger, on your Claude account."
        action={
          status.connected ? (
            test.phase === "failed" ? (
              <Badge tone="warning" icon={<IconAlertTriangle size={14} stroke={2} />}>Needs attention</Badge>
            ) : (
              <Badge tone="success" icon={<IconCircleCheck size={14} stroke={2} />}>Connected</Badge>
            )
          ) : (
            <Badge>Not connected</Badge>
          )
        }
      />
      <CardBody className="flex flex-col gap-5">
        {status.connected && !editing ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
            <dt className="type-ui text-subtle-fg">Task</dt>
            <dd className="type-code text-secondary break-all">{status.routineId}</dd>
            {status.tokenHint ? (
              <>
                <dt className="type-ui text-subtle-fg">Token</dt>
                <dd className="type-code text-secondary">{status.tokenHint}</dd>
              </>
            ) : null}
            <dt className="type-ui text-subtle-fg">Connected</dt>
            <dd className="type-ui text-secondary">{status.source === "env" ? "Set up by the admin" : formatDate(status.connectedAt)}</dd>
            {verified ? (
              <>
                <dt className="type-ui text-subtle-fg">Last test</dt>
                <dd className="type-ui text-secondary">Passed {formatDate(status.verifiedAt)}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            <Field label="Fire URL" htmlFor="fireUrl" error={errors.fireUrl} hint="Shown next to the token when you add the API trigger.">
              <Input
                id="fireUrl"
                value={fireUrl}
                onChange={(e) => setFireUrl(e.target.value)}
                placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.fireUrl) || undefined}
                className="type-code"
              />
            </Field>
            <Field label="API token" htmlFor="token" error={errors.token} hint="Stored encrypted. It can only start this one task.">
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="sk-ant-oat01-…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.token) || undefined}
                className="type-code"
              />
            </Field>
            {errors.form ? <p className="type-small text-error-fg">{errors.form}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" loading={saving} icon={<IconKey {...ICON} />}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {status.connected ? (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        )}

        {test.phase === "running" ? (
          <Alert tone="info" icon={<span className="block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />} title="Testing the connection">
            <p>{test.step}</p>
            {test.sessionUrl ? <SessionLink href={test.sessionUrl} /> : null}
          </Alert>
        ) : test.phase === "passed" ? (
          <Alert tone="success" icon={<IconCircleCheck size={18} stroke={1.75} />} title="Connection works">
            <p>The session started on your account and reported back. You can delegate issues now.</p>
            <SessionLink href={test.sessionUrl} />
          </Alert>
        ) : test.phase === "failed" ? (
          <Alert tone="error" icon={<IconAlertTriangle size={18} stroke={1.75} />} title="Test failed">
            <p>{test.message}</p>
            {test.sessionUrl ? <SessionLink href={test.sessionUrl} /> : null}
          </Alert>
        ) : null}

        {status.connected && !editing ? (
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-5">
            <Button variant="secondary" onClick={runTest} loading={test.phase === "running"} icon={<IconPlayerPlay {...ICON} />}>
              {test.phase === "running" ? "Testing…" : "Test connection"}
            </Button>
            {status.source !== "env" ? (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)} icon={<IconRefresh {...ICON} />}>
                  Replace
                </Button>
                <Button variant="ghost" onClick={disconnect} icon={<IconPlugConnectedX {...ICON} />}>
                  Disconnect
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {status.connected && !editing && test.phase === "idle" ? (
          <p className="-mt-2 type-small text-subtle-fg">You're set: delegate an issue to Claude Code in Linear. Testing is optional; it starts one short session that changes nothing.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SessionLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 type-ui font-medium text-primary underline-offset-3 hover:underline">
      Open the session
      <IconExternalLink size={14} stroke={1.75} />
    </a>
  );
}
