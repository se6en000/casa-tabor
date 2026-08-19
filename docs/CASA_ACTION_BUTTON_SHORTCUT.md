# iPhone Action Button: Casa Copilot Setup & API Reference

Transform your iPhone Action Button (iPhone 15 Pro / 16 / 16 Pro) into an executive voice hotline to **Casa Tabor** running live on Vercel and Supabase.

---

## 1. How It Operates (Dual-Lane Architecture)

```mermaid
graph TD
    A["iPhone Action Button"] -->|Hold / Press| B["iOS Shortcut"]
    B -->|Dictate Audio -> Text| C["POST /functions/v1/capture-command"]
    
    subgraph Casa Cloud Backend (Supabase / Vercel)
        C --> D{"Smart Gate Router"}
        D -->|Fast Grocery / Basic Reminder ~80ms| E["Lane 1: Deterministic Engine"]
        D -->|Rescheduling / Conflicts / Natural Speech ~500ms| F["Lane 2: Executive AI Lane (Gemini)"]
        E --> G["execute-ai-action"]
        F --> G
        G --> H["Casa Database (Realtime Sync)"]
    end

    H --> I["Response JSON"]
    I -->|spoken_summary <15 words| J["Siri Spoken Feedback (AirPods / iPhone)"]
    I -->|Glanceable Card| K["iOS Lock Screen Notification"]
```

- **Lane 1 (Ultra-Low Latency <100ms)**: Direct grocery items (*"add oat milk and cold brew"*) and simple alarms.
- **Lane 2 (Executive AI Intelligence ~500ms)**: Complex multi-turn calendar rescheduling (*"move dentist to tomorrow 3pm"*), commute buffer queries, and family schedule questions.

---

## 2. Step-by-Step iOS Shortcut Recipe

### Step A: Generate Your Capture Token
1. In your browser, open **Casa Tabor** &rarr; navigate to **AI Settings** (`/settings/ai#ai-shortcuts`).
2. Under **Generate New Shortcut Token**, type a label (e.g. `Jake iPhone Action Button`) and click **Generate token**.
3. Click **Copy token**.

### Step B: Build the Shortcut in the iOS Shortcuts App
1. Open the **Shortcuts** app on your iPhone.
2. Tap **`+`** (top right) to create a new shortcut.
3. Rename it to **"Talk to Casa"**.
4. Add the following action stack:

| Action # | Action Name | Configuration / Parameters |
| :--- | :--- | :--- |
| **1** | **Vibrate Device** | Default |
| **2** | **Dictate Text** | Language: `English (US)`, Stop Listening: `On Pause` |
| **3** | **Get Contents of URL** | **URL**: `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/capture-command`<br>**Method**: `POST`<br>**Headers**:<br>&bull; `x-casa-capture-token`: `<PASTE_COPIED_TOKEN>`<br>&bull; `content-type`: `application/json`<br>**Request Body (JSON)**:<br>&bull; `text`: `[Dictated Text]`<br>&bull; `client_request_id`: `[UUID]` (or `[Current Date]`)<br>&bull; `channel`: `shortcut`<br>&bull; `request_mode`: `voice`<br>&bull; `utc_offset`: `-04:00` |
| **4** | **Get Dictionary Value** | Key: `spoken_summary` from `[Contents of URL]` |
| **5** | **Speak Text** | Text: `[Dictionary Value]`, Rate: `1.05x`, Pitch: `Normal` |
| **6** | **Show Notification** | Title: `Casa Copilot`, Body: `[Dictionary Value]`, Sound: `Off` |

### Step C: Assign to Physical Action Button
1. Open **Settings** on your iPhone.
2. Select **Action Button**.
3. Swipe across to **Shortcut**.
4. Choose **"Talk to Casa"**.

---

## 3. Webhook Contract Specification

### Endpoint: `POST https://<PROJECT_REF>.supabase.co/functions/v1/capture-command`

#### Headers
```http
Content-Type: application/json
x-casa-capture-token: casa_capture_9f823...
```

#### Request JSON Body
```json
{
  "text": "Move dentist to tomorrow 3pm",
  "client_request_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "channel": "shortcut",
  "request_mode": "voice",
  "utc_offset": "-04:00"
}
```

#### Response JSON Body (200 OK)
```json
{
  "status": "executed",
  "resolved_intent": "ai_assistant_execution",
  "spoken_summary": "Moved Dentist to tomorrow at 3 PM. Commute departure is 2:25 PM.",
  "response_text": "Moved Dentist to tomorrow at 3 PM. Commute departure is 2:25 PM.",
  "clarification_question": null,
  "created_entities": [],
  "confidence": 0.9,
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

---

## 4. In-App Testing Workbench

You can test your prompts without even touching your phone:
- Go to **AI Settings &rarr; Interactive Voice Capture Workbench**.
- Click any sample chip (*"Move dentist appointment to tomorrow at 3pm"*, *"Add oat milk and cold brew"*) or type custom text.
- Inspect the live latency, resolved intent, and $<15$-word Siri spoken summary in real time!
