// A light tap you can feel (premium plan, Phase B — an experiment). A web app on iPhone has no vibration API; iOS 18's
// native switch control does give a haptic tick when it flips, so a hidden switch is flipped through its label. Kept
// only if it works on Jake's phone; anywhere it doesn't, it does nothing.

let label: HTMLLabelElement | null = null

function ensure(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null
  if (label?.isConnected) return label
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.id = 'casa-haptic'
  input.tabIndex = -1
  input.setAttribute('aria-hidden', 'true')
  label = document.createElement('label')
  label.htmlFor = 'casa-haptic'
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden'
  label.appendChild(input)
  document.body.appendChild(label)
  return label
}

export function haptic(): void {
  try {
    const isIOS = /iPhone|iPad/.test(navigator.userAgent)
    if (!isIOS) return
    ensure()?.click()
  } catch { /* never let a tap fail anything */ }
}
