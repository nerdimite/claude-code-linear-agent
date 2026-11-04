import { IconLogout } from "@tabler/icons-react";
import Image from "next/image";
import type { Viewer } from "@/lib/session";

export function SiteHeader({ viewer }: { viewer: Viewer | null }) {
  return (
    <header className="border-b border-border-subtle bg-page">
      <div className="mx-auto flex h-14 max-w-[880px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image src="/bot-icon.png" alt="" width={24} height={24} className="shrink-0" priority />
          <span className="truncate type-body-strong text-primary">Claude Code Linear Agent</span>
          <span className="hidden rounded-full border border-border px-2 py-0.5 type-small text-subtle-fg sm:inline">Unofficial</span>
        </div>
        {viewer ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="type-ui font-medium text-primary">{viewer.name}</p>
              <p className="type-small text-subtle-fg">{viewer.organizationName}</p>
            </div>
            {viewer.avatarUrl ? (
              // biome-ignore lint/performance/noImgElement: remote Linear avatar, not worth an image loader
              <img src={viewer.avatarUrl} alt="" className="size-8 rounded-full border border-border-subtle" />
            ) : (
              <span className="grid size-8 place-items-center rounded-full bg-track type-ui font-medium text-secondary">
                {viewer.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="grid size-control-sm cursor-pointer place-items-center rounded-8 text-muted hover:bg-hover hover:text-primary"
              >
                <IconLogout size={16} stroke={1.75} />
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
