export type RoutineCredential = { fireUrl: string; token: string };


export type FireResult = { sessionId: string; sessionUrl: string };

export class RoutineFireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

export async function fireRoutine(cred: RoutineCredential, text: string): Promise<FireResult> {
  const res = await fetch(cred.fireUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.token}`,
      "anthropic-version": "2026-10-21",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) {
    let message = body;
    try {
      message = JSON.parse(body).error?.message ?? body;
    } catch {}
    throw new RoutineFireError(`Routine fire failed (${res.status}): ${message}`, res.status, res.headers.get("retry-after") ?? undefined);
  }
  const json = JSON.parse(body) as { claude_code_session_id: string; claude_code_session_url: string };
  return { sessionId: json.claude_code_session_id, sessionUrl: json.claude_code_session_url };
}
