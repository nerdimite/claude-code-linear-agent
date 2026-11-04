// Prints the exact instructions to paste into a person's Claude Code task (the same text /connect shows).
// Usage: bun .claude/skills/setup-claude-linear-agent/scripts/routine-prompt.ts https://<your-app>.vercel.app
import { savedRoutinePrompt } from "../../../../lib/routine-prompt";

const base = process.argv[2] ?? process.env.PUBLIC_BASE_URL;
if (!base) {
  console.error("Pass the production URL (PUBLIC_BASE_URL).");
  process.exit(1);
}
console.log(savedRoutinePrompt(base.replace(/\/$/, "")));
