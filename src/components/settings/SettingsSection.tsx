import type { HTMLAttributes, ReactNode } from 'react'
import { ContentSection } from '../ui'

export interface SettingsSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, description, action, children, className, ...rest }: SettingsSectionProps) {
  return (
    <ContentSection title={title} description={description} action={action} className={className} {...rest}>
      {children}
    </ContentSection>
  )
}
