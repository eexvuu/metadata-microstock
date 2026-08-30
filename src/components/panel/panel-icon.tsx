import {
  Archive,
  Check,
  CreditCard,
  FolderOpen,
  Gauge,
  KeyRound,
  Layers,
  Mail,
  Pause,
  Play,
  Send,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { PanelIcon as PanelIconName } from '#/lib/panel/types'

/**
 * Icons cross the wire as names, not components, so the sidebar can be driven
 * by server data. Add an entry here before using it in a resource — an
 * unknown name falls back to `layers` rather than blowing up the page.
 */
const ICONS: Record<PanelIconName, LucideIcon> = {
  folder: FolderOpen,
  users: Users,
  'credit-card': CreditCard,
  mail: Mail,
  layers: Layers,
  gauge: Gauge,
  play: Play,
  pause: Pause,
  archive: Archive,
  check: Check,
  send: Send,
  key: KeyRound,
}

export function PanelIcon({
  name,
  className,
}: {
  name: PanelIconName
  className?: string
}) {
  const Icon = ICONS[name] ?? Layers

  return <Icon className={className} />
}
