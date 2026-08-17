// Phase 2 shared UI primitives — see src/pages/DesignSystemGalleryPage.tsx
// for a live rendering of every state, and src/design-system/variants.mjs
// for the pure (framework-free) class-name logic behind each variant.
export { Button, type ButtonContentAlign, type ButtonProps } from './Button'
export { IconButton, type IconButtonProps } from './IconButton'
export { Card, type CardProps } from './Card'
export { Chip, type ChipProps } from './Chip'
export { CalendarPill, type CalendarPillProps } from './CalendarPill'
export { PersonAvatarStack, type PersonAvatar, type PersonAvatarStackProps } from './PersonAvatarStack'
export { SegmentedControl, type SegmentedControlOption, type SegmentedControlProps } from './SegmentedControl'
export { Field, Input, Select, Textarea, type FieldProps, type InputProps, type SelectProps, type TextareaProps } from './Field'
export { Modal, type ModalProps } from './Modal'
export { Sheet, type SheetProps } from './Sheet'
export { PageShell, type PageShellProps, type PageShellWidth } from './PageShell'
export { Heading, Text, type HeadingProps, type TextProps, type HeadingRole, type HeadingTone, type TextRole } from './Typography'
export { Switch, Checkbox, Radio, type SwitchProps, type CheckboxProps, type RadioProps } from './SelectionControls'
export { Combobox, type ComboboxOption, type ComboboxProps } from './Combobox'
export { Alert, type AlertProps, type AlertTone } from './Alert'
export { Toast, type ToastProps, type ToastTone } from './Toast'
export { Progress, type ProgressProps } from './Progress'
export { Skeleton, SkeletonRow } from './Skeleton'
export { LiveTranscript, type LiveTranscriptProps } from './LiveTranscript'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { DateTimeDial, type DateTimeDialProps } from './DateTimeDial'
export { DisclosureSection, type DisclosureSectionProps } from './DisclosureSection'
export { StatusDot, type StatusDotProps } from './StatusDot'
export { HeroCard, type HeroCardProps } from './HeroCard'
export { JourneyProgressBar, type JourneyProgressBarProps } from './JourneyProgressBar'
export { WidgetContainer, type WidgetContainerProps } from './WidgetContainer'
export { ScheduleStreamItem, type ScheduleStreamItemProps } from './ScheduleStreamItem'
export { ActionCard, type ActionCardProps, type ActionCardTone } from './ActionCard'
export { FormSummaryCard, type FormSummaryCardProps } from './FormSummaryCard'
export {
  TactileSheenBeam,
  TactileSwapBadge,
  type TactileSheenBeamProps,
  type TactileSwapBadgeProps,
} from './TactileSwap'
export {
  ConfirmationDialog,
  ContentSection,
  MasterDetailLayout,
  PageFeedback,
  PageHeader,
  PrimaryRail,
  SecondaryRail,
  SectionHeader,
  ThreeRailLayout,
  WorkflowActions,
  type ConfirmationDialogProps,
  type ContentSectionProps,
  type MasterDetailLayoutProps,
  type PageHeaderProps,
  type SectionHeaderProps,
  type ThreeRailLayoutProps,
  type WorkflowActionsProps,
} from './Patterns'
export { JewelCapsuleCopilot, type JewelCapsuleCopilotProps } from './JewelCapsuleCopilot'
