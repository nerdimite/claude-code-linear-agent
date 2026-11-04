"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** A read-only block of text with a copy button, for values people paste into claude.ai. */
export function CopyBlock({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={cn("relative rounded-8 border border-border bg-well", className)}>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 pr-12 type-code text-secondary">{value}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        className="absolute top-2 right-2 grid size-control-sm cursor-pointer place-items-center rounded-8 border border-border bg-card text-muted hover:border-border-hover hover:text-primary"
      >
        {copied ? <IconCheck size={16} stroke={1.75} className="text-success-fg" /> : <IconCopy size={16} stroke={1.75} />}
      </button>
    </div>
  );
}
