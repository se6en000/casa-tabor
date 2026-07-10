import type { ElementType, ReactNode } from 'react'
import { Heading, Text } from '../ui'

export interface SettingsPageHeaderProps {
  icon?: ElementType
  title: ReactNode
  description?: ReactNode
}

export function SettingsPageHeader({ icon: Icon, title, description }: SettingsPageHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      {Icon && (
        <span className="flex size-control items-center justify-center rounded-full border border-casa-border bg-casa-bg text-casa-gold">
          <Icon size={18} />
        </span>
      )}
      <div className="min-w-0">
        <Heading role="display-sm">{title}</Heading>
        {description && <Text role="body-sm" muted>{description}</Text>}
      </div>
    </header>
  )
}
