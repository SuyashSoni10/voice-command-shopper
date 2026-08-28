import os
import re
import json
import uuid
import asyncio
import collections
from datetime import datetime
from typing import List, Optional, Dict, Union
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from thefuzz import process

from catalog import (
    lookup_by_keyword,
    get_all_keywords,
    resolve_unit_alias,
    QUANTITY_MULTIPLIERS,
    ALL_ITEMS,
    RELATED_ITEMS,
)
from restricter import validate_add_item, can_sum_units, sum_quantities

# ─── Environment ──────────────────────────────────────────────────────
load_dotenv(dotenv_path="../.env")

# ─── In-Memory Data Store ─────────────────────────────────────────────

# Shopping list: session_id -> item_id -> item dict
shopping_lists: Dict[str, Dict[str, dict]] = {}
purchase_history: Dict[str, list] = {}

# Locks
session_locks: Dict[str, asyncio.Lock] = {}
global_lock = asyncio.Lock()

# Rolling buffer for unrecognized intents
unknown_logs = collections.deque(maxlen=100)

async def get_session_lock(session_id: str) -> asyncio.Lock:
    async with global_lock:
        if session_id not in session_locks:
            session_locks[session_id] = asyncio.Lock()
        return session_locks[session_id]

def get_shopping_list(session_id: str) -> Dict[str, dict]:
    if session_id not in shopping_lists:
        shopping_lists[session_id] = {}
    return shopping_lists[session_id]

# Store profile
store_profile: dict = {
    "id": str(uuid.uuid4()),
    "business_name": "Voice Shopper",
    "description": "Speak to manage your shopping list",
    "logo_url": None,
}

# ─── FastAPI App ───────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────────

class NluRequest(BaseModel):
    transcript: str
    language: str
    currentList: Optional[List[dict]] = []
class RemoveItemRequest(BaseModel):
    item_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None

class Entities(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    rejected: Optional[bool] = None
    rejection_reason: Optional[str] = None

class NluAction(BaseModel):
    intent: str
    entities: Entities
    confidence: float

class NluResponse(BaseModel):
    actions: List[NluAction]
    detected_language: str

class AddItemRequest(BaseModel):
    item_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None

class UpdateProfileRequest(BaseModel):
    business_name: Optional[str] = None
    description: Optional[str] = None


# ─── LLM System Prompt ────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are the Natural Language Understanding (NLU) engine for a voice-first shopping list manager.
Your job is to parse the user's raw transcript and map it into one or more structured actions.

CRITICAL: A single utterance may contain MULTIPLE actions. For example:
- "Add milk and remove eggs" → two actions (ADD_ITEM for milk, REMOVE_ITEM for eggs).
- "Add bread, butter, and cheese" → three ADD_ITEM actions.
Always output ALL actions present in the utterance.

You will also receive the user's CURRENT SHOPPING LIST for context. Use it to:
- Resolve ambiguous references like "remove the first thing" or "change the milk to 2 gallons".
- Correctly match item names when the user uses abbreviations or synonyms.
- Return UPDATE_QUANTITY (not REMOVE_ITEM) when the user says things like "change apples to 5" and apples are already on the list.

Here are the intent categories:
- ADD_ITEM: Add something to the list.
- REMOVE_ITEM: Remove something (entirely) from the list, or remove a specific quantity.
- UPDATE_QUANTITY: Change the quantity of an existing item on the list.
- CLEAR_LIST: Start over or clear the list.
- UNKNOWN: Anything else or below confidence threshold.

Entity Schema instructions:
- 'item_name' MUST strictly be normalized to lowercase singular (e.g. "bananas" -> "banana", "potatoes" -> "potato"). This is CRITICAL for deduplication. Do not output plurals.
- 'quantity' is a number (e.g. 5). For "half a dozen" → 6, "a couple" → 2, etc.
  - IMPORTANT: "dozen" means 12, "half a dozen" means 6. These are quantity multipliers, NOT units.
  - IMPORTANT: If the user says complex weights like "1 kg and 200 gram", sum them into a single decimal number in the larger unit (e.g., quantity 1.2, unit "kg").
  - IMPORTANT: If the user explicitly asks for a singular item (e.g. "a banana", "milk"), set quantity to 1.
  - IMPORTANT: If the user asks for a plural item but DOES NOT specify a quantity (e.g. "bananas", "apples"), set quantity to null.
- 'unit' is the unit. MUST be normalized (e.g., "kg", "g", "l", "ml", "bottle"). Use null if not mentioned.
  - IMPORTANT: "dozen" is NOT a unit. Convert it to quantity (dozen=12, half dozen=6) and set unit to null or "piece".
- 'brand' is the brand if mentioned, null otherwise.
"""


# ─── Helpers ──────────────────────────────────────────────────────────

def singularize(word: str) -> str:
    if not word: return word
    if word == 'cookies': return 'cookie'
    if word == 'boxes': return 'box'
    if word.endswith('ies'): return word[:-3] + 'y'
    if word.endswith('oes'): return word[:-2]
    if word.endswith('s') and not word.endswith('ss'): return word[:-1]
    return word


def fuzzy_match_catalog(item_name: str) -> Optional[str]:
    if not item_name:
        return item_name
    all_kws = get_all_keywords()
    if not all_kws:
        return item_name
    best, score = process.extractOne(item_name.lower(), all_kws)
    if score >= 80:
        item = lookup_by_keyword(best)
        if item:
            return item["name"]
    return item_name


def run_restricter_on_action(action: NluAction) -> NluAction:
    """Validate ADD_ITEM actions through the restricter."""
    if action.intent != "ADD_ITEM":
        return action

    result = validate_add_item(
        item_name=action.entities.item_name,
        quantity=action.entities.quantity,
        unit=action.entities.unit,
    )

    if result.valid:
        action.entities.item_name = result.item_name
        action.entities.quantity = result.quantity
        action.entities.unit = result.unit
        action.entities.category = result.category
    else:
        action.entities.rejected = True
        action.entities.rejection_reason = result.reason
        action.confidence = 0.0

    return action


def _find_existing_item(name: str, session_id: str) -> Optional[str]:
    """Find an existing item ID by name (case-insensitive)."""
    s_list = get_shopping_list(session_id)

    if session_id not in purchase_history:
        purchase_history[session_id] = []
    purchase_history[session_id].append({
        "item_name": name,
        "added_at": datetime.now().isoformat()
    })

    for item_id, item in s_list.items():
        if item["name"].lower() == name.lower():
            return item_id
    return None


def _add_item_to_store(name: str, quantity: float, unit: Optional[str], session_id: str, category: Optional[str] = None) -> dict:
    """Add or merge an item into the in-memory shopping list."""
    existing_id = _find_existing_item(name, session_id)
    s_list = get_shopping_list(session_id)

    if session_id not in purchase_history:
        purchase_history[session_id] = []
    purchase_history[session_id].append({
        "item_name": name,
        "added_at": datetime.now().isoformat()
    })


    if existing_id:
        existing = s_list[existing_id]
        ex_qty = existing.get("quantity", 1)
        ex_unit = existing.get("unit") or unit

        if ex_unit and unit and can_sum_units(ex_unit, unit):
            try:
                total_qty, display_unit = sum_quantities(ex_qty, ex_unit, quantity, unit)
                existing["quantity"] = total_qty
                existing["unit"] = display_unit
                existing["purchased_at"] = None
                return {**existing, "merged": True}
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
        else:
            existing["quantity"] = ex_qty + quantity
            if unit:
                existing["unit"] = unit
            existing["purchased_at"] = None
            return {**existing, "merged": True}
    else:
        item_id = str(uuid.uuid4())
        item = {
            "id": item_id,
            "name": name,
            "quantity": quantity,
            "unit": unit,
            "category": category,
            "purchased_at": None,
            "added_at": datetime.now().isoformat(),
        }
        s_list[item_id] = item
        return {**item, "merged": False}


# ─── Fast Path (regex) ────────────────────────────────────────────────

def parse_single_fragment(normalized: str) -> Optional[NluAction]:
    # 1. Clear list
    if normalized in ['clear my list', 'clear list', 'clear the list', 'start over', 'delete everything']:
        return NluAction(intent="CLEAR_LIST", entities=Entities(), confidence=1.0)

    # 4. Search Filter
    filter_match = re.match(r'^(?:(?:can you |please )?(?:find|search for|look up|do we have)) (.*?) (?:under|below) (\d+(?:\.\d+)?)$', normalized)
    if filter_match:
        return NluAction(intent="SEARCH_ITEM", entities=Entities(item_name=singularize(filter_match.group(1)), price_max=float(filter_match.group(2))), confidence=1.0)

    # 5. Search Item
    search_match = re.match(r'^(?:(?:can you |please )?(?:find|search for|look up|do we have)) (.*?)$', normalized)
    if search_match:
        return NluAction(intent="SEARCH_ITEM", entities=Entities(item_name=singularize(search_match.group(1))), confidence=1.0)

    word_to_num = {
        'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3,
        'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
        'nine': 9, 'ten': 10, 'dozen': 12, 'a dozen': 12, 'an dozen': 12,
        'half a dozen': 6, 'a half dozen': 6, 'half dozen': 6,
    }

    def _parse_qty_unit_item(qty_str, unit_str, item_str):
        parsed_qty = None
        if qty_str:
            if qty_str.lstrip('-').replace('.', '', 1).isdigit():
                parsed_qty = float(qty_str)
            else:
                parsed_qty = word_to_num.get(qty_str)
                if parsed_qty is None:
                    best, score = process.extractOne(qty_str, word_to_num.keys())
                    if score >= 80:
                        parsed_qty = word_to_num[best]
                    else:
                        parsed_qty = 1
        else:
            parsed_qty = None if item_str.endswith('s') else 1
            
        item_str = item_str.strip()
        if item_str.startswith('the '):
            item_str = item_str[4:]
        if item_str.startswith('of '):
            item_str = item_str[3:]
            
        final_unit = singularize(unit_str.replace(' of', '').strip()) if unit_str else None
        return singularize(item_str), parsed_qty, final_unit

    # 2. Remove item
    remove_match = re.match(
        r'^(?:(?:can you |please |i want to |i need to )?(?:remove|delete|take off|drop)) '
        r'(?:((?:-?\d*\.\d+|-?\d+)|a dozen|an dozen|a half dozen|half a dozen|half dozen|dozen|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?'
        r'(?:(bottles?|cans?|boxes?|gallons?|packs?|bags?|liters?|litre?|l|ml|grams?|gm|g|kg?|kilos?|kilograms?|loaves?|loaf|pieces?)(?:\s+of)?\s+)?'
        r'(.*?)(?: from my list)?$', 
        normalized
    )
    if remove_match:
        qty_str, unit_str, item_str = remove_match.group(1), remove_match.group(2), remove_match.group(3)
        fallback_keywords = [' put ', 'some']
        if any(kw in item_str for kw in fallback_keywords) or len(item_str) > 30:
            return None
        i_name, i_qty, i_unit = _parse_qty_unit_item(qty_str, unit_str, item_str)
        if not qty_str:
            i_qty = None
        return NluAction(intent="REMOVE_ITEM", entities=Entities(item_name=i_name, quantity=i_qty, unit=i_unit), confidence=1.0)

    # 3. Add item
    add_match = re.match(
        r'^(?:(?:i want to |i need to |can you |please )?(?:add|buy|get)|i need|i want) '
        r'(?:((?:-?\d*\.\d+|-?\d+)|a dozen|an dozen|a half dozen|half a dozen|half dozen|dozen|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?'
        r'(?:(bottles?|cans?|boxes?|gallons?|packs?|bags?|liters?|litre?|l|ml|grams?|gm|g|kg?|kilos?|kilograms?|loaves?|loaf|pieces?)(?:\s+of)?\s+)?'
        r'(.*?)$',
        normalized
    )
    if add_match:
        qty_str, unit_str, item_str = add_match.group(1), add_match.group(2), add_match.group(3)
        fallback_keywords = ['under', 'find']
        if any(kw in item_str for kw in fallback_keywords) or len(item_str) > 30 or len(item_str.split(' ')) > 4:
            return None
        i_name, i_qty, i_unit = _parse_qty_unit_item(qty_str, unit_str, item_str)
        
        action = NluAction(intent="ADD_ITEM", entities=Entities(item_name=i_name, quantity=i_qty, unit=i_unit), confidence=1.0)
        return run_restricter_on_action(action)

    # 6. Update item
    update_match = re.match(r'^(?:(?:can you |please |i want to |i need to )?(?:update|increase|reduce|change|set)) (.*?) to (.*)$', normalized)
    if update_match:
        item_name = singularize(update_match.group(1).strip())
        target_qty_str = update_match.group(2).strip()
        
        qty_match = re.match(
            r'^((?:-?\d*\.\d+|-?\d+)|a dozen|an dozen|a half dozen|half a dozen|half dozen|dozen|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*'
            r'(bottles?|cans?|boxes?|gallons?|packs?|bags?|liters?|litre?|l|ml|grams?|gm|g|kg?|kilos?|kilograms?|loaves?|loaf|pieces?)?$',
            target_qty_str
        )
        if qty_match:
            qty_str, unit_str = qty_match.group(1), qty_match.group(2)
            _, i_qty, i_unit = _parse_qty_unit_item(qty_str, unit_str, 'dummy')
            return NluAction(intent="UPDATE_ITEM", entities=Entities(item_name=item_name, quantity=i_qty, unit=i_unit), confidence=1.0)
        else:
            _, i_qty, i_unit = _parse_qty_unit_item(target_qty_str, None, 'dummy')
            return NluAction(intent="UPDATE_ITEM", entities=Entities(item_name=item_name, quantity=i_qty, unit=None), confidence=1.0)

    return None

def parse_fast_path(transcript: str, language: str) -> Optional[NluResponse]:
    print('FAST PATH TRANSCRIPT:', transcript)
    translation_dict = None
    lang_prefix = language.split('-')[0].lower()
    
    if lang_prefix != 'en':
        try:
            with open(f"translations/{lang_prefix}.json", "r", encoding="utf-8") as f:
                import json
                translation_dict = json.load(f)
        except FileNotFoundError:
            return None
            
        words = transcript.lower().split()
        mapped_words = [translation_dict["inputs"].get(w, w) for w in words]
        transcript = " ".join(mapped_words)
        
    normalized = re.sub(r'[!.?]', '', transcript.lower().strip())
    
    # --- ASR Corrections & HCI Syntactic Sugar ---
    # Strip auxiliary phrases and conversational articles
    aux_pattern = r'\b(please|can you|could you|i want to|i need to|i need|i want|will you)\b'
    normalized = re.sub(aux_pattern, '', normalized)
    normalized = re.sub(r'\bthe\b', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    normalized = re.sub(r'\bat\b', 'add', normalized)
    normalized = re.sub(r'\bad\b', 'add', normalized)
    normalized = re.sub(r'\bhad\b', 'add', normalized)
    normalized = re.sub(r'\b(add|buy|get|remove|delete)\s+to\b', r'\g<1> two', normalized)
    
    # Handle "decrease/increase [item] by [quantity]" syntax
    normalized = re.sub(r'\b(?:decrease|reduce) (.*?) by (.*)\b', r'remove \2 of \1', normalized)
    normalized = re.sub(r'\b(?:increase) (.*?) by (.*)\b', r'add \2 of \1', normalized)
    normalized = re.sub(r'\b(add|buy|get|remove|delete)\s+for\b', r'\g<1> four', normalized)
    normalized = re.sub(r'\btoo\b', 'two', normalized)
    normalized = normalized.replace(" more ", " ")
    
    # Swaps / Replace
    normalized = re.sub(r'\b(?:swap|replace)\s+(.*?)\s+(?:for|with)\s+(.*?)\b', r'remove \1 and add \2', normalized)
    normalized = re.sub(r'\binstead of\s+(.*?)(?:,\s*|\s+)(?:get|add|buy|)\s*(.*?)\b', r'remove \1 and add \2', normalized)
    # -----------------------
    
    # First split by explicit conjunctions/punctuation
    parts = re.split(r'\s*,\s*and\s+|\s+and\s+|\s+&\s+|\s*,\s*', normalized)
    fragments = []
    # Then split parts that contain multiple verbs without conjunctions
    split_pattern = r'(?<!\byou)(?<!\bplease)(?<!\bto)(?<!\bneed)(?<!\bwant)(?<!\bcan)\s+(?=\b(?:add|buy|get|remove|delete|take off|drop|find|search|look up|clear|update|increase|reduce|change|set|i want to|i need to|please|can you)\b)'
    for part in parts:
        fragments.extend(re.split(split_pattern, part))
        
    actions = []
    current_verb = None
    verbs = ['add', 'buy', 'get', 'remove', 'delete', 'take off', 'drop', 'find', 'search', 'look up', 'clear', 'update', 'increase', 'reduce', 'change', 'set', 'i want to', 'i need to', 'please', 'can you']
    
    for frag in fragments:
        print('FRAG:', frag)
        frag = frag.strip()
        if not frag:
            continue
            
        has_verb = False
        for v in verbs:
            if frag.startswith(v + ' ') or frag == v:
                has_verb = True
                if v in ['add', 'buy', 'get', 'remove', 'delete', 'take off', 'drop', 'find', 'search', 'look up', 'update', 'increase', 'reduce', 'change', 'set']:
                    current_verb = v
                break
                
        if not has_verb and current_verb:
            frag = f"{current_verb} {frag}"
            
        action = parse_single_fragment(frag)
        if action:
            actions.append(action)
        else:
            actions.append(NluAction(intent="UNKNOWN", entities=Entities(), confidence=0.0))

    if not actions:
        actions = [NluAction(intent="UNKNOWN", entities=Entities(), confidence=0.0)]
        
    if translation_dict:
        for action in actions:
            if action.entities.item_name:
                eng_name = action.entities.item_name
                action.entities.item_name = translation_dict["outputs"].get(eng_name, eng_name)
            if action.entities.category:
                eng_cat = action.entities.category
                action.entities.category = translation_dict["outputs"].get(eng_cat, eng_cat)
                
    return NluResponse(actions=actions, detected_language=language)


# ═══════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════

# ─── NLU ──────────────────────────────────────────────────────────────

@app.post("/api/nlu")
async def process_nlu(request: NluRequest, x_session_id: str = Header("default")):
    """Parse voice transcript: fast-path → LLM fallback → restricter."""

    async with await get_session_lock(x_session_id):
        fast_result = parse_fast_path(request.transcript, request.language)
        if fast_result and fast_result.actions and fast_result.actions[0].intent != "UNKNOWN":
            print("Fast path matched:", fast_result)
            return fast_result

    print("Fast path failed to match. Returning UNKNOWN.")
    # Log to rolling buffer
    unknown_logs.append({
        "timestamp": datetime.now().isoformat(),
        "raw_text": request.transcript,
        "language": request.language,
        "session_id": x_session_id
    })
    
    return fast_result


# ─── Shopping List CRUD ───────────────────────────────────────────────


@app.get("/api/suggest")
async def get_suggestions(x_session_id: str = Header("default")):
    """Get top 5 item suggestions based on frequency and recency."""
    s_list = get_shopping_list(x_session_id)
    history = purchase_history.get(x_session_id, [])
    
    current_names = {item["name"].lower() for item in s_list.values()}
    
    item_stats = {}
    for entry in history:
        name = entry["item_name"]
        if name.lower() in current_names:
            continue
            
        added_at = datetime.fromisoformat(entry["added_at"])
        days_since = (datetime.now() - added_at).days
        
        if name not in item_stats:
            item_stats[name] = {"frequency": 0, "last_days": days_since}
        
        item_stats[name]["frequency"] += 1
        item_stats[name]["last_days"] = min(item_stats[name]["last_days"], days_since)
        
    suggestions = []
    for name, stats in item_stats.items():
        score = stats["frequency"] * (1 / (1 + stats["last_days"]))
        suggestions.append({"name": name, "score": score})
        
    suggestions.sort(key=lambda x: x["score"], reverse=True)
    
    # Pad with default suggestions if needed
    DEFAULT_SUGGESTIONS = ["milk", "egg", "bread", "banana", "potato"]
    existing_suggestion_names = {s["name"].lower() for s in suggestions}
    
    for default_item in DEFAULT_SUGGESTIONS:
        if len(suggestions) >= 5:
            break
        if default_item.lower() not in current_names and default_item.lower() not in existing_suggestion_names:
            suggestions.append({"name": default_item, "score": 0})
            existing_suggestion_names.add(default_item.lower())

    return suggestions[:5]

@app.get("/api/items")
async def get_items(x_session_id: str = Header("default")):
    """Return all shopping list items, newest first."""
    s_list = get_shopping_list(x_session_id)
    items = sorted(s_list.values(), key=lambda x: x.get("added_at", ""), reverse=True)
    return items


@app.post("/api/items")
async def add_item(request: AddItemRequest, x_session_id: str = Header("default")):
    """Add or merge an item (with restricter validation)."""
    result = validate_add_item(request.item_name, request.quantity, request.unit)
    if not result.valid:
        raise HTTPException(status_code=400, detail=result.reason)

    async with await get_session_lock(x_session_id):
        item = _add_item_to_store(
            name=result.item_name,
            quantity=result.quantity,
            unit=result.unit,
            session_id=x_session_id,
            category=result.category,
        )
        
        # Calculate follow-ups
        s_list = get_shopping_list(x_session_id)
        current_names = {i["name"].lower() for i in s_list.values()}
        potential_follow_ups = RELATED_ITEMS.get(result.item_name.lower(), [])
        
        follow_ups = []
        for follow_up in potential_follow_ups:
            if follow_up.lower() not in current_names:
                follow_ups.append(follow_up)
                
    return {"item": item, "follow_ups": follow_ups}

@app.delete("/api/items/clear")
async def clear_items(x_session_id: str = Header("default")):
    """Clear the entire shopping list."""
    async with await get_session_lock(x_session_id):
        get_shopping_list(x_session_id).clear()
    return {"success": True}

@app.patch("/api/items/update")
async def update_item_qty(request: RemoveItemRequest, x_session_id: str = Header("default")):
    """Update a specific item's quantity via name."""
    async with await get_session_lock(x_session_id):
        s_list = get_shopping_list(x_session_id)
        name_lower = request.item_name.lower()
        
        target_id = None
        for item_id, item in s_list.items():
            if item["name"].lower() == name_lower:
                target_id = item_id
                break
                
        if target_id:
            s_list[target_id]["quantity"] = request.quantity or 1
            if request.unit:
                s_list[target_id]["unit"] = request.unit
            return {"success": True, "item": s_list[target_id]}
        
        # If not found, add it
        item = _add_item_to_store(
            name=request.item_name,
            quantity=request.quantity or 1,
            unit=request.unit,
            session_id=x_session_id,
        )
        return {"success": True, "item": item, "merged": False}

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str, x_session_id: str = Header("default")):
    """Delete a single item by ID."""
    async with await get_session_lock(x_session_id):
        s_list = get_shopping_list(x_session_id)
        if item_id in s_list:
            del s_list[item_id]
            return {"success": True}
    raise HTTPException(status_code=404, detail="Item not found")

@app.delete("/api/items/by-name/{item_name}")
async def delete_item_by_name(item_name: str, x_session_id: str = Header("default")):
    """Delete an item by name (case-insensitive)."""
    async with await get_session_lock(x_session_id):
        item_id = _find_existing_item(item_name, x_session_id)
        s_list = get_shopping_list(x_session_id)
        if item_id:
            del s_list[item_id]
            return {"success": True}
    raise HTTPException(status_code=404, detail=f"Item '{item_name}' not found")

@app.post("/api/items/remove")
async def remove_item_quantity(request: RemoveItemRequest, x_session_id: str = Header("default")):
    """Remove an item completely, or subtract a specific quantity."""
    async with await get_session_lock(x_session_id):
        item_id = _find_existing_item(request.item_name, x_session_id)
        s_list = get_shopping_list(x_session_id)
        if not item_id:
            raise HTTPException(status_code=404, detail=f"Item '{request.item_name}' not found")
            
        if request.quantity is None:
            # Full removal
            del s_list[item_id]
            return {"success": True, "removed": True}
            
        item = s_list[item_id]
        
        ex_qty = item.get("quantity", 1)
        ex_unit = item.get("unit") or request.unit
        req_unit = request.unit or ex_unit
        
        from restricter import UNIT_TO_BASE, UNIT_DIMENSION
        from catalog import DISPLAY_THRESHOLDS
        
        if ex_unit and req_unit and not can_sum_units(ex_unit, req_unit):
            raise HTTPException(status_code=400, detail=f"Cannot subtract {req_unit} from {ex_unit}")
            
        base_a = ex_qty * UNIT_TO_BASE.get(ex_unit, 1.0)
        base_b = request.quantity * UNIT_TO_BASE.get(req_unit, 1.0)
        
        total_base = base_a - base_b
        
        if total_base <= 0.001:  # account for floating point
            del s_list[item_id]
            return {"success": True, "removed": True}
            
        dim = UNIT_DIMENSION.get(ex_unit, "count")
        if dim in DISPLAY_THRESHOLDS:
            info = DISPLAY_THRESHOLDS[dim]
            if total_base >= info["threshold"]:
                item["quantity"] = round(total_base / info["threshold"], 3)
                item["unit"] = info["large"]
            else:
                item["quantity"] = round(total_base, 3)
                item["unit"] = info["base"]
        else:
            item["quantity"] = round(total_base, 3)
            item["unit"] = ex_unit
            
        return {"success": True, "removed": False, "item": item}


@app.patch("/api/items/{item_id}/toggle")
async def toggle_purchased(item_id: str, x_session_id: str = Header("default")):
    """Toggle the purchased state of an item."""
    async with await get_session_lock(x_session_id):
        s_list = get_shopping_list(x_session_id)
        if item_id not in s_list:
            raise HTTPException(status_code=404, detail="Item not found")
        item = s_list[item_id]
        item["purchased_at"] = None if item.get("purchased_at") else datetime.now().isoformat()
        return item


@app.patch("/api/items/{item_id}")
async def update_item(item_id: str, updates: dict, x_session_id: str = Header("default")):
    """Update item fields (quantity, unit, etc)."""
    if "quantity" in updates and updates["quantity"] is not None and updates["quantity"] <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive.")
        
    async with await get_session_lock(x_session_id):
        s_list = get_shopping_list(x_session_id)
        if item_id not in s_list:
            raise HTTPException(status_code=404, detail="Item not found")
        item = s_list[item_id]
        for key in ["quantity", "unit", "name"]:
            if key in updates:
                item[key] = updates[key]
        return item


# ─── Store Profile ────────────────────────────────────────────────────

@app.get("/api/profile")
async def get_profile():
    return store_profile


@app.put("/api/profile")
async def update_profile(request: UpdateProfileRequest):
    if request.business_name is not None:
        store_profile["business_name"] = request.business_name
    if request.description is not None:
        store_profile["description"] = request.description
    return store_profile


# ─── Catalog Search ──────────────────────────────────────────────────

@app.get("/api/catalog/search")
async def search_catalog(q: str):
    """Fuzzy search the local catalog."""
    matched_name = fuzzy_match_catalog(q)
    item = lookup_by_keyword(matched_name) if matched_name else None
    if item:
        return {"found": True, "item": item}
    return {"found": False, "query": q}
