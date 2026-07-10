import { clsx, type ClassValue } from 'clsx'
import { casaTwMerge } from './tailwindMerge.mjs'

export function cn(...inputs: ClassValue[]) {
  return casaTwMerge(clsx(inputs))
}