# Casa Tabor — Tactile Polish & Micro-Delight Ideas

A curated catalog of tactile, sensory, and glanceable interaction designs for Casa Tabor’s touchscreen kiosks, mobile devices, and shared family displays.

---

## 1. Micro-Haptic Pulses (Web Vibration API)
> **Goal**: Provide weighted, physical confirmation for key family actions on touchscreens.

### Interaction Blueprint
- **Check-off Tactile Double-Tick**: When marking a reminder, grocery item, or preparation task complete:
  - Pattern: `navigator.vibrate([10, 35, 14])`
  - Feels like a tactile mechanical latch clicking into place.
- **Swipe-to-Commit Threshold**:
  - When dragging a reminder pill past the threshold (60px), fire an instant single `12ms` tick before the release animation triggers.
- **View & Filter Switching**:
  - Switching between Day, Week, and Month or toggling Today / Tomorrow triggers a soft `8ms` micro-pulse.

### Technical Implementation
```typescript
export function triggerHaptic(type: 'tap' | 'success' | 'threshold' | 'light') {
  if (typeof window === 'undefined' || !navigator.vibrate) return
  switch (type) {
    case 'light':
      navigator.vibrate(8)
      break
    case 'tap':
      navigator.vibrate(12)
      break
    case 'threshold':
      navigator.vibrate(15)
      break
    case 'success':
      navigator.vibrate([10, 30, 14])
      break
  }
}
```

---

## 2. "Household in Harmony" Golden Shimmer Celebration
> **Goal**: Reward parents and kids when all urgent logistics, conflict resolutions, and morning prep items are cleared.

### Interaction Blueprint
- **Trigger**: When the last item in the *Action Queue*, *Needs You* rail, or today's checklist transitions to completed.
- **Visual Motion**:
  - A 1.2-second soft golden light sweep (`linear-gradient(90deg, transparent, rgba(201, 169, 110, 0.35), transparent)`) traverses horizontally across the plinth container.
  - The emerald *"Household in Harmony"* card gracefully fades in with a gentle spring bounce (`scale: [0.96, 1.02, 1.0]`).
- **Aesthetic Tone**: Quiet, luxurious satisfaction without jarring noise or intrusive confetti.

---

## 3. Time-Aware Diurnal Ambient Backlight
> **Goal**: Make the kitchen kiosk and home hero cards feel alive and attuned to the sun and house rhythm.

### Diurnal Palette Schedule
| Time of Day | Lighting State | Color Temperature | Purpose |
| :--- | :--- | :--- | :--- |
| **06:30 – 11:00** | **Dawn / Morning Focus** | Crisp Champagne (`#F9F4E8`) | High clarity for morning school rushes |
| **11:00 – 17:30** | **Natural Daylight** | Clean Natural Linen (`#FAF8F5`) | Balanced readability for mid-day check-ins |
| **17:30 – 20:30** | **Golden Hour & Dinner** | Warm Amber Glow (`#C9A96E` / `#E8A849`) | Cozy, inviting atmosphere for family dinner |
| **20:30 – 06:30** | **Night Wind-Down** | Deep Obsidian Slate (`#0B132B`) | Zero glare in dark rooms; subdued contrast |

### Technical Implementation
- CSS variables computed once every minute in `useLiveClock`:
```css
:root[data-time-phase="golden-hour"] {
  --casa-ambient-glow: rgba(201, 169, 110, 0.18);
  --casa-ambient-blur: 48px;
}
:root[data-time-phase="wind-down"] {
  --casa-ambient-glow: rgba(27, 42, 74, 0.4);
  --casa-kiosk-dim: 0.88;
}
```

---

## 4. Avatar Quick-Isolation Wave
> **Goal**: Single-tap clarity for answering *"What does Olivia / Sarah have going on this week?"*

### Interaction Blueprint
- **Action**: Tap any member avatar in the family header row or ribbon legend.
- **Behavior**:
  - **Isolated Member**: Their event cards scale up slightly (`scale(1.02)`) with full color saturation and subtle golden ring borders.
  - **Other Members**: All other event cards gracefully fade to `30%` opacity and `grayscale(20%)`.
  - **Reset**: Tapping the avatar again or touching any blank canvas area smoothly snaps all cards back to 100% in 180ms.

---

## 5. Subtle Mechanical Sound Cues (Optional Kiosk Soundscapes)
> **Goal**: Tactile acoustic feedback for dedicated wall-mounted touchscreen tablets.

### Sound Identity (Organic & Wooden)
- **Check Complete**: A warm wooden marimba tap (soft wooden block tick).
- **Dinner Transition**: A delicate glass acoustic chime when the meal moves to *"Cook Now"*.
- **Calendar Flip**: Whisper-soft page turn sound for switching calendar days.
- **User Control**: Dedicated toggle in Settings (`Settings > Display & Touch > Kiosk Soundscapes: On/Off`).
