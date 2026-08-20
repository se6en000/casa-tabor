import type { ElementType, ReactNode } from 'react'
import { PageHeader } from '../ui'

export interface SettingsPageHeaderProps {
  icon?: ElementType
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function SettingsPageHeader({ icon: Icon, title, description, actions }: SettingsPageHeaderProps) {
  return <PageHeader icon={Icon} title={title} description={description} actions={actions} />
}
