import type { ElementType, ReactNode } from 'react'
import { PageHeader } from '../ui'

export interface SettingsPageHeaderProps {
  icon?: ElementType
  title: ReactNode
  description?: ReactNode
}

export function SettingsPageHeader({ icon: Icon, title, description }: SettingsPageHeaderProps) {
  return <PageHeader icon={Icon} title={title} description={description} />
}
