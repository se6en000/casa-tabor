export interface ComponentDocumentation {
  name: string
  category: string
  purpose: string
  useWhen: string
  avoid: string
  variants: string[]
  states: string[]
  accessibility: string
  responsive: string
  example: string
}

export interface DesignSystemRelease {
  version: string
  date: string
  changes: string[]
}

export const DESIGN_SYSTEM_VERSION: string
export const DESIGN_SYSTEM_RELEASE_DATE: string
export const DESIGN_SYSTEM_SCHEMA_VERSION: number
export const COMPONENT_MANIFEST: ComponentDocumentation[]
export const DESIGN_SYSTEM_CHANGELOG: DesignSystemRelease[]

export function renderComponentGuide(): string
export function renderDesignSystemChangelog(): string
