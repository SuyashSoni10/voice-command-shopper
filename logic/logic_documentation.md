# Voice Command Shopping Assistant: Logic & Architecture Deep-Dive

This document provides a comprehensive technical breakdown of how the Voice Command Shopping Assistant operates. It details the journey of a spoken word from the user's microphone all the way through to mathematical normalization and state management on the backend.

---

## 1. System Architecture Overview

The application follows a decoupled client-server architecture designed for zero-latency, local execution:

- **Frontend (Client):** A React (Vite) Single Page Application styled with modern Tailwind V4 and Lucide React. It handles the microphone API, live transcription, and rendering the shopping list.
- **Backend (Server):** A Python FastAPI server that acts as the "brain". It stores the shopping list state in-memory and houses the complex Natural Language Understanding (NLU) logic, validation engine, and product catalog.

---

## 2. Phase 1: Speech-to-Text (Frontend)

The journey begins in the browser using the native `window.SpeechRecognition` (Web Speech API). 

1. **Listening State:** When the user taps the microphone, the browser begins capturing audio.
2. **Interim Transcripts:** As the user speaks, the API returns *interim results*. The frontend renders these in real-time ("Listening...") to provide immediate visual feedback.
3. **Final Transcript:** When the user pauses or stops speaking, the API finalizes the string (e.g., `"add half a dozen eggs"`). This raw string is immediately dispatched via an HTTP `POST` request to the backend at `/api/nlu`.

---

## 3. Phase 2: Natural Language Understanding (Backend Fast-Path)

Once the raw transcript hits `main.py` on the backend, it enters the **Fast-Path Regex Parser**. We explicitly abandoned heavy, slow Cloud LLMs in favor of a lightning-fast, deterministic Regular Expression engine.

### How Words are Interpreted

The function `parse_fast_path(text, current_list)` sanitizes the input by lowering the case and stripping punctuation, then attempts to match the string against highly tuned regex patterns.

#### A. The `ADD_ITEM` Regex Structure
```python
r'^(?:(?:i want to |i need to |can you |please )?(?:add|buy|get)|i need|i want) '
r'(?:(\d+|a dozen|an dozen|a half dozen|half a dozen|half dozen|dozen|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?'
r'(?:(bottles?|cans?|boxes?|gallons?|packs?|bags?|liters?|litre?|l|ml|grams?|gm|g|kg?|kilos?|kilograms?)(?:\s+of)?\s+)?'
r'(.*?)$'
```
This regex is divided into four critical capture groups:

1. **Action Prefix (Ignored):** Words like `"add"`, `"please buy"`, or `"i need"`. This anchors the intent but is discarded.
2. **Quantity Group:** Captures numeric values (`"500"`), textual numbers (`"two"`), or colloquial terms (`"half a dozen"`).
3. **Unit Group:** Captures the measurement metric. It supports both long-form (`"grams"`, `"kilograms"`) and aliases (`"g"`, `"ml"`, `"kg"`). It also silently strips the connector word `"of"` (e.g., capturing `"grams"` out of `"grams of"`).
4. **Item Group (Greedy):** Captures whatever is left at the end of the sentence as the raw item name (e.g., `"tomato"`).

#### B. Tracing an Example: `"add 500 g of tomato"`
1. Matches prefix: `"add "`
2. Captures Quantity: `"500"` → Casts to integer `500.0`.
3. Captures Unit: `"g of "` → Strips `" of"`, leaving `"g"`.
4. Captures Item: `"tomato"`.

The output is an `NluAction` object with the intent `ADD_ITEM` and entities `{ item_name: "tomato", quantity: 500.0, unit: "g" }`.

---

## 4. Phase 3: The Restricter Engine (Validation)

Before an item is saved to the list, the `NluAction` is passed to the **Restricter Engine** (`restricter.py`). This engine applies strict business logic to ensure physical and mathematical validity.

### Step 1: Catalog Resolution & Fuzzy Matching
The engine looks up `"tomato"` in `catalog.py`. 
- If the user had said `"tomaato"`, an exact match would fail.
- It then falls back to `thefuzz` library, which calculates the Levenshtein distance against all 290+ keywords in the catalog. 
- `"tomaato"` vs `"tomato"` scores a 90+ match, exceeding the `FUZZY_THRESHOLD` of 80. The engine seamlessly corrects the spelling.

### Step 2: Dozen Expansion
If the quantity group had captured `"half a dozen"`, the engine intercepts it here. It intercepts the unit `"dozen"`, multiplies the base quantity by 6, and forces the unit to `"piece"`.

### Step 3: Unit Normalization & Compatibility
The item in the catalog defines its physically allowed units. For example, a tomato allows `["kg", "g", "piece"]`.
- If the user said `"1 liter of tomato"`, the engine intercepts this, recognizes `"l"` (volume) is incompatible with a tomato, rejects the action, and returns an error reason to the frontend.
- If no unit was spoken (`"add 1 tomato"`), the engine assigns the item's default unit (for tomato, `"piece"`).

### Step 4: Overdraft & Negative Checks
The engine enforces a hard cap (`MAX_BASE_QUANTITY` = 1,000,000 base units) to prevent memory overflow or UI breaking. It also blocks negative additions.

---

## 5. Phase 4: Cross-Unit Mathematical Merging

If the user adds an item that already exists on the list, the engine does not create a duplicate row. Instead, it performs **Cross-Unit Dimensional Summation**.

Example Scenario:
- **Existing List:** `1 kg of tomato`
- **New Command:** `"add 500 g of tomato"`

1. **Base Conversion:** The engine maps both units to their fundamental dimension base (Grams for weight).
   - `1 kg` × `1000` = `1000 base_grams`
   - `500 g` × `1` = `500 base_grams`
2. **Summation:** `1000 + 500 = 1500 base_grams`.
3. **Display Thresholding:** The engine checks the display logic in `catalog.py`. Because `1500 grams` exceeds the `1000 gram` threshold, it divides by 1000 and assigns the larger display unit (`"kg"`).
4. **Result:** The list is updated to `1.5 kg`.

This same logic works perfectly in reverse when a `REMOVE_ITEM` command is triggered with a partial quantity. Removing `200g` from `1.5kg` results in `1.3kg`. If the subtraction results in a value $\le 0$, the item is deleted entirely.

---

## 6. Phase 5: State Synchronization

Once the backend updates the in-memory dictionary, the HTTP `POST /api/nlu` request resolves. 

1. The frontend receives the success response.
2. The frontend fires a secondary `GET /api/items` request to fetch the newly merged, pristine state of the list.
3. React renders the items natively, animating them in via Tailwind/CSS animations.
4. A toast notification is triggered on the UI utilizing the exact resolved entities (e.g., `Added 500 g of tomato`).

---

## Conclusion
By shifting entirely to a local deterministic architecture, the application achieves 0-latency execution, perfect testability, and high mathematical rigor, all without relying on unpredictable or hallucination-prone Cloud LLMs. The word interpretation relies on powerful regex, backed by robust fuzzy matching and a heavily structured catalog schema.
