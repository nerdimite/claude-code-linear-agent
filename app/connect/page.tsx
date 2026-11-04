import { IconAlertTriangle, IconArrowUpRight, IconChevronDown, IconLogin2 } from "@tabler/icons-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConnectPanel } from "@/components/connect-panel";
import { CopyBlock } from "@/components/copy-block";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { credentials } from "@/lib/credentials";
import { env } from "@/lib/env";
import { savedRoutinePrompt } from "@/lib/routine-prompt";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Connect · Claude Code Linear Agent (unofficial)" };
export const dynamic = "force-dynamic";

const SIGN_IN_ERRORS: Record<string, string> = {
  state: "The sign-in link expired. Try again.",
  denied: "Linear sign-in was cancelled.",
  workspace: "This agent isn't installed in your Linear workspace. Ask a Linear admin to install it first.",
  linear: "Linear sign-in failed. Try again in a moment.",
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await getViewer();
  const { error } = await searchParams;
  const status = viewer ? await credentials.status(viewer.linearUserId) : null;

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main className="mx-auto flex max-w-[880px] flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <section className="flex flex-col gap-3">
          <h1 className="type-display text-primary">Delegate Linear issues to Claude Code</h1>
          <p className="max-w-[60ch] type-body text-muted">
            Assign an issue to <span className="font-medium text-secondary">Claude Code</span> in Linear and a Claude Code session starts on the web,
            on your own Claude account. It works in the repository, opens a pull request, and reports its plan and progress back to the issue.
          </p>
        </section>

        {error && SIGN_IN_ERRORS[error] ? (
          <Alert tone="error" icon={<IconAlertTriangle size={18} stroke={1.75} />} title="Couldn't sign you in">
            {SIGN_IN_ERRORS[error]}
          </Alert>
        ) : null}

        {!viewer || !status ? (
          <Card>
            <CardHeader title="Sign in with Linear" description="So the agent knows which Linear user your Claude account belongs to." />
            <CardBody className="flex flex-col items-start gap-4">
              <a href="/api/auth/linear/start" className={buttonVariants({ variant: "primary" })}>
                <IconLogin2 size={16} stroke={1.75} />
                Continue with Linear
              </a>
              <p className="type-small text-subtle-fg">Read-only, and only used to learn who you are. The agent doesn't keep the Linear token.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            {status.connected ? (
              <>
                <ConnectPanel initial={status} />
                <HowToUse />
                <details className="group rounded-12 border border-border bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 type-body-strong text-primary">
                    Setup steps
                    <IconChevronDown size={16} stroke={1.75} className="text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-border-subtle">
                    <StepList baseUrl={env.publicBaseUrl} />
                  </div>
                </details>
              </>
            ) : (
              <>
                <Steps baseUrl={env.publicBaseUrl} />
                <ConnectPanel initial={status} />
                <HowToUse />
              </>
            )}
          </>
        )}

        <footer className="border-t border-border-subtle pt-6 type-small text-subtle-fg">
          An unofficial integration, not made or supported by Anthropic or Linear. Sessions run on your Claude subscription.
        </footer>
      </main>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-4">
      <span className="grid size-7 place-items-center rounded-full border border-border bg-card type-small font-semibold text-secondary">{n}</span>
      <div className="flex min-w-0 flex-col gap-3 pt-0.5">
        <h3 className="type-body-strong text-primary">{title}</h3>
        <div className="flex flex-col gap-3 type-body text-muted">{children}</div>
      </div>
    </li>
  );
}

function Setting({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt className="type-ui font-medium text-secondary">{name}</dt>
      <dd className="type-ui text-muted">{children}</dd>
    </>
  );
}

function Steps({ baseUrl }: { baseUrl: string }) {
  return (
    <Card>
      <CardHeader title="Set up your Claude Code task" description="One time, about two minutes. Everything happens in the claude.ai UI." />
      <StepList baseUrl={baseUrl} />
    </Card>
  );
}

function StepList({ baseUrl }: { baseUrl: string }) {
  return (
      <CardBody>
        <ol className="flex flex-col gap-7">
          <Step n={1} title="Create a scheduled task">
            <p>
              Open{" "}
              <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-3 hover:underline">
                claude.ai/code/routines
                <IconArrowUpRight size={14} stroke={1.75} />
              </a>{" "}
              and choose <span className="font-medium text-secondary">New task</span>, then <span className="font-medium text-secondary">Set up manually</span>.
            </p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-8 border border-border-subtle bg-subtle px-4 py-3 sm:grid-cols-[140px_1fr]">
              <Setting name="Name">Linear dispatch, or anything you like</Setting>
              <Setting name="Model">Pick Opus explicitly. Default may run a smaller model.</Setting>
              <Setting name="Repository">The repositories issues will touch</Setting>
              <Setting name="Connectors">Linear. Remove the rest: issue text is written by other people.</Setting>
            </dl>
          </Step>
          <Step n={2} title="Paste these instructions">
            <p>Put this in the task's Instructions box, exactly as written. It tells the session to trust the agent and report back to it.</p>
            <CopyBlock value={savedRoutinePrompt(baseUrl)} />
          </Step>
          <Step n={3} title="Add an API trigger">
            <p>
              Change the trigger to <span className="font-medium text-secondary">API</span> and create the task. Claude shows the token once, with the fire URL. Paste both
              into the form on this page.
            </p>
          </Step>
        </ol>
      </CardBody>
  );
}

function formatWindow(minutes: number): string {
  if (minutes % 60 === 0) return minutes === 60 ? "hour" : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

function HowToUse() {
  return (
    <Card>
      <CardHeader title="Using it" />
      <CardBody>
        <ul className="flex flex-col gap-3 type-body text-muted">
          <li>
            <span className="font-medium text-secondary">Start:</span> delegate an issue to Claude Code, or mention it. The issue moves to In Progress and links the
            session.
          </li>
          <li>
            <span className="font-medium text-secondary">Follow up:</span> reply in the issue's agent thread. The same session picks it up, whether it's still
            working or finished in the last {formatWindow(env.idleWindowMinutes)}. After that, a reply starts a continuation session.
          </li>
          <li>
            <span className="font-medium text-secondary">Stop:</span> use Stop in Linear. The session halts at its next update.
          </li>
        </ul>
      </CardBody>
    </Card>
  );
}
