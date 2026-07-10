export interface DeviceProfile {
  id: string
  label: string
  width: number
  height: number
  input: 'touch' | 'fine-pointer'
  context: string
  acceptance: string[]
}

export const DEVICE_MATRIX: DeviceProfile[]

export function closestDeviceProfile(
  width: number,
  height: number,
  input?: 'touch' | 'fine-pointer',
): DeviceProfile

export function exactDeviceMatch(width: number, height: number): DeviceProfile | null
