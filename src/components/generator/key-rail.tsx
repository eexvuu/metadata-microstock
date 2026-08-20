import { useEffect, useState } from 'react'

import type { KeyLive } from '#/lib/generator/use-generator'
import { useMessages } from '#/lib/i18n'

export interface RailKey {
  id: string
  label: string
  preview: string
}

/**
 * The rotation rail.
 *
 * Rotation is the part of this tool people do not believe until they watch it:
 * every key gets its own worker, a 429 cools one key for a minute while the
 * others keep going, and a key that dies is replaced from the reserves. So the
 * keys are drawn as a rail of meters rather than described in prose.
 *
 * `live[i]` and `keys[i]` line up because both come from the same
 * created-at-ascending, active-only list the run was started with.
 */
export function KeyRail({ keys, live }: { keys: RailKey[]; live: KeyLive[] }) {
  const m = useMessages()
  const now = useNow(live.some((entry) => entry.cooldownUntil > 0))

  if (keys.length === 0) {
    return (
      <p className="border-(--line) text-muted-foreground border border-dashed px-3 py-4 text-center font-mono text-xs">
        {m.keys.railEmpty}
      </p>
    )
  }

  return (
    <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((key, index) => {
        const state = live[index]
        const cooling = state ? Math.max(0, state.cooldownUntil - now) : 0
        const status = !state
          ? m.keys.idle
          : state.dead
            ? m.keys.outOfQuota
            : cooling > 0
              ? m.keys.cooling(Math.ceil(cooling / 1000))
              : state.current
                ? m.keys.busy
                : m.keys.ready

        return (
          <div
            key={key.id}
            data-state={state?.dead ? 'dead' : state?.current ? 'working' : 'idle'}
            className="border-(--line) bg-card border p-3 data-[state=dead]:opacity-55"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow text-muted-foreground">
                {m.keys.keyN(index + 1)}
              </span>
              <span
                className={
                  state?.dead
                    ? 'bg-destructive size-1.5'
                    : state?.current
                      ? 'bg-primary developing size-1.5'
                      : cooling > 0
                        ? 'bg-primary/40 size-1.5'
                        : 'bg-muted-foreground/40 size-1.5'
                }
              />
            </div>

            <p className="mt-2 font-mono text-xs">{key.preview}</p>
            <p className="text-muted-foreground truncate font-mono text-[0.65rem]">
              {key.label}
            </p>

            <div className="border-(--line) mt-3 flex items-baseline justify-between border-t pt-2 font-mono text-[0.65rem]">
              <span className={state?.dead ? 'text-destructive' : 'text-primary'}>
                {status}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {m.keys.filesDone(state?.done ?? 0)}
              </span>
            </div>

            {state?.current ? (
              <p className="text-muted-foreground mt-1 truncate font-mono text-[0.65rem]">
                → {state.current}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Ticks once a second, and only while something is actually counting down. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  return now
}
