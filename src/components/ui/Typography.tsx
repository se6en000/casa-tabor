import { forwardRef } from 'react'
import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export type HeadingRole = 'display-xl' | 'display-lg' | 'display-md' | 'display-sm' | 'heading'
export type HeadingTone = 'default' | 'on-dark'
export type TextRole = 'body-lg' | 'body' | 'body-sm' | 'caption'

const HEADING_ROLE_CLASSES: Record<HeadingRole, string> = {
  'display-xl': 'font-display text-display-xl',
  'display-lg': 'font-display text-display-lg',
  'display-md': 'font-display text-display-md',
  'display-sm': 'font-display text-display-sm',
  heading: 'font-display text-heading',
}

const DEFAULT_HEADING_ELEMENT: Record<HeadingRole, ElementType> = {
  'display-xl': 'h1',
  'display-lg': 'h1',
  'display-md': 'h2',
  'display-sm': 'h2',
  heading: 'h3',
}

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Semantic type role from src/design-system/tokens.mjs — controls fluid font size. */
  role?: HeadingRole
  /** Uses the guaranteed high-contrast heading color for navy and other dark branded surfaces. */
  tone?: HeadingTone
  /** Overrides the default element for this role (e.g. force an <h2> for a display-xl look). */
  as?: ElementType
}

/** Semantic display/heading text — maps directly to the generated text-* tokens. */
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { role = 'heading', tone = 'default', as, className, ...rest },
  ref,
) {
  const Tag = (as ?? DEFAULT_HEADING_ELEMENT[role]) as ElementType
  return (
    <Tag
      ref={ref}
      className={cn(HEADING_ROLE_CLASSES[role], tone === 'on-dark' ? 'casa-heading-on-dark' : 'text-content-heading', className)}
      {...rest}
    />
  )
})

const TEXT_ROLE_CLASSES: Record<TextRole, string> = {
  'body-lg': 'text-body-lg',
  body: 'text-body',
  'body-sm': 'text-body-sm',
  caption: 'text-caption',
}

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  role?: TextRole
  as?: ElementType
  /** Uses the muted/secondary text token instead of the primary text color. */
  muted?: boolean
}

/** Semantic body/caption text — maps directly to the generated text-* tokens. */
export const Text = forwardRef<HTMLParagraphElement, TextProps>(function Text(
  { role = 'body', as = 'p', muted = false, className, ...rest },
  ref,
) {
  const Tag = as as ElementType
  return (
    <Tag
      ref={ref}
      className={cn(TEXT_ROLE_CLASSES[role], muted ? 'text-casa-muted' : 'text-casa-text', className)}
      {...rest}
    />
  )
})
