import { Switch } from '../ui'

export interface SettingsToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  desc?: string
  disabled?: boolean
}

export function SettingsToggle({ checked, onChange, label, desc, disabled }: SettingsToggleProps) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      label={label}
      description={desc}
      disabled={disabled}
      className="py-1"
    />
  )
}
