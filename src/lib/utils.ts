import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes so later ones win. Used by every shadcn component. */
export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}
