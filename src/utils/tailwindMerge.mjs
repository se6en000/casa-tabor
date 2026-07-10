import { extendTailwindMerge } from 'tailwind-merge'

const CASA_TEXT_SIZE_TOKENS = [
  'display-xl',
  'display-lg',
  'display-md',
  'display-sm',
  'heading',
  'body-lg',
  'body',
  'body-sm',
  'caption',
]

export const casaTwMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: CASA_TEXT_SIZE_TOKENS,
    },
  },
})
