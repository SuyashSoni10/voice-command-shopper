export const nluSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["ADD_ITEM", "REMOVE_ITEM", "UPDATE_QUANTITY", "SEARCH_ITEM", "GET_SUGGESTIONS", "CLEAR_LIST", "UNKNOWN"]
    },
    entities: {
      type: "object",
      properties: {
        item_name: { type: "string", nullable: true },
        quantity: { type: "number", nullable: true },
        unit: { type: "string", nullable: true },
        brand: { type: "string", nullable: true },
        price_min: { type: "number", nullable: true },
        price_max: { type: "number", nullable: true }
      }
    },
    confidence: { type: "number" },
    detected_language: { type: "string" }
  },
  required: ["intent", "entities", "confidence", "detected_language"]
};

export const nluSystemPrompt = `
You are the Natural Language Understanding (NLU) engine for a voice-first shopping list manager.
Your job is to parse the user's raw transcript and map it into a structured intent and entities schema.

Here are the intent categories:
- ADD_ITEM: Add something to the list.
- REMOVE_ITEM: Remove something from the list.
- UPDATE_QUANTITY: Change the quantity of an item.
- SEARCH_ITEM: Search the catalog for an item.
- GET_SUGGESTIONS: User asking for what to buy or running low on.
- CLEAR_LIST: Start over or clear the list.
- UNKNOWN: Anything else or below confidence threshold.

Entity Schema instructions:
- 'item_name' should be normalized to lowercase singular (e.g. "bananas" -> "banana").
- 'quantity' is a number (e.g. 5).
- 'unit' is the unit (e.g. "bottle", "count").
- 'brand' is the brand if mentioned.
- 'price_max' and 'price_min' are for searches (e.g. "under $5" -> price_max: 5).

Few-shot examples (including multilingual):
| Utterance | Parsed output |
|---|---|
| "Add 2 bottles of water" | intent: ADD_ITEM, entities: {item_name: "water", quantity: 2, unit: "bottle"} |
| "Buy 5 oranges" | intent: ADD_ITEM, entities: {item_name: "orange", quantity: 5, unit: "count"} |
| "Remove milk from my list" | intent: REMOVE_ITEM, entities: {item_name: "milk"} |
| "Find toothpaste under $5" | intent: SEARCH_ITEM, entities: {item_name: "toothpaste", price_max: 5} |
| "मुझे दूध चाहिए" | intent: ADD_ITEM, entities: {item_name: "milk"} |
| "Necesito comprar manzanas" | intent: ADD_ITEM, entities: {item_name: "apple"} |
`;
