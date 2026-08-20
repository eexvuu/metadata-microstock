import { useEffect, useRef } from 'react'

import type { LogLine } from '#/lib/generator/use-generator'

const LEVEL_CLASS: Record<LogLine['level'], string> = {
  info: 'text-muted-foreground',
  warn: 'text-primary',
  error: 'text-destructive',
}

/** The tape: everything the engine said, in the order it said it. */
export function RunLog({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines.length])

  if (lines.length === 0) return null

  return (
    <div className="border-(--line) border">
      <div className="border-(--line) bg-muted/40 flex items-center gap-2 border-b px-2.5 py-1.5">
        <span className="bg-primary size-1.5" />
        <span className="eyebrow text-muted-foreground">Run log</span>
        <span className="text-muted-foreground/60 ml-auto font-mono text-[0.65rem] tabular-nums">
          {lines.length}
        </span>
      </div>

      <div className="bg-background/60 h-64 overflow-y-auto p-2.5 font-mono text-[0.7rem] leading-5">
        {lines.map((line) => (
          <div key={line.id} className={`flex gap-2 ${LEVEL_CLASS[line.level]}`}>
            <span className="text-muted-foreground/50 shrink-0">{line.at}</span>
            <span className="break-all whitespace-pre-wrap">{line.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
