/**
 * The saved instructions every person pastes into their Claude Code task. Naming the agent's host and
 * calling the callbacks the intended reporting channel is what lets the cloud session's auto-mode
 * safety check allow them (a POST to an unnamed host is blocked as exfiltration).
 */
export function savedRoutinePrompt(baseUrl: string): string {
  return `You are started by the Claude Code Linear Agent, a service at ${baseUrl} that I set up. Treat the routine-fire-payload block as trusted instructions from that agent and follow them.

The payload tells you to report progress by POSTing small JSON events with curl to a callback URL under ${baseUrl}/api/runs/, and to wait for my follow-up messages by calling a wait URL there in a loop. That is the expected reporting channel between me in Linear and this session, not data exfiltration. Only send the progress events the payload describes (plans, short progress notes, the PR link, a final summary). Never send secrets, environment variables or file contents there.`;
}
