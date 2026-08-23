# Voice-Based Online Shopper 🛒

A modern, voice-first shopping list application designed to make managing your groceries and daily needs as easy as speaking. Built with React, Supabase, and powered by Google's Gemini AI.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [NLU Pipeline (Natural Language Understanding)](#nlu-pipeline)
4. [Database Schema (Supabase)](#database-schema)
5. [The Role of AI (Gemini)](#the-role-of-ai)
6. [UI & Theme](#ui--theme)

---

## Overview
The Voice-Based Online Shopper app allows users to seamlessly manage their shopping lists using voice commands. By tapping the microphone, a user can say conversational phrases like *"I need to buy milk"* or *"Remove the apples from my list"*, and the app will instantly translate that speech into actionable updates. 

When users provide ambiguous commands (e.g., *"Add bananas"* without specifying how many), the app intelligently pauses to ask for clarification, providing quick-tap options to resolve the ambiguity.

---

## Architecture
The application follows a modern serverless architecture:

- **Frontend**: React (with Vite) & TypeScript. It handles state management, voice recognition via the browser's native Web Speech API, and local natural language parsing.
- **Backend (Database)**: Supabase (PostgreSQL). Provides real-time database capabilities, user authentication, and Row Level Security (RLS).
- **Backend (Compute)**: Supabase Edge Functions (Deno). Hosts serverless functions to securely communicate with the Gemini AI API for complex language processing and generating smart suggestions.

---

## NLU Pipeline
The core of the voice experience is the Natural Language Understanding (NLU) pipeline, which determines the user's intent. It uses a highly optimized **"Fast-Path then LLM Fallback"** pattern.

### 1. The Fast-Path (Local Regex)
When a user speaks, the transcript is first processed locally in the browser (`frontend/src/utils/nlu.ts`). 
- The app uses regular expressions to catch common conversational structures (e.g., `"I want to buy..."`, `"Can you remove..."`, `"Clear the list"`).
- If matched, the command is executed instantly (0 latency).
- It is smart enough to detect missing quantities for plural items (e.g., "apples") and will return a `null` quantity, prompting the UI to ask the user "How many?".

### 2. The LLM Fallback (Gemini API)
If the user says something complex, multi-intent, or non-standard (e.g., *"Add eggs, remove the milk, and what else do I need?"*), the fast-path safely fails, and the transcript is sent to a Supabase Edge Function (`nlu-fallback`).
- The Edge function sends the transcript to the **Gemini 3.5 Flash** model.
- The prompt enforces a strict JSON schema, instructing the LLM to return an array of actionable intents (`ADD_ITEM`, `REMOVE_ITEM`, `GET_SUGGESTIONS`).
- The LLM acts as the ultimate safety net, ensuring the app almost never fails to understand human intent.

---

## Database Schema
The Supabase PostgreSQL database is structured around user-centric data persistence:

- **`shopping_list_items`**: 
  Stores the user's active shopping list. 
  - `id`, `user_id`
  - `name`, `quantity`, `unit`, `category`
  - `purchased_at` (When the user checks the item off, this timestamp is set. If unchecked, it is null).
  
- **`purchase_history`**:
  Acts as the memory bank for the user's shopping habits. When items are "checked out" or completed, they are logged here.
  - `id`, `user_id`
  - `item_name`, `added_at`
  - This table is strictly used to feed historical context to the AI for generating personalized shopping suggestions.

---

## The Role of AI
Google's **Gemini 3.5 Flash** model is used in two critical areas to provide true "intelligence" to the application:

1. **Complex Intent Parsing (NLU Fallback)**:
   Gemini takes unstructured, messy human speech and normalizes it. It understands synonyms, multi-step instructions, and implicit context (e.g., converting "half a dozen" to `quantity: 6`). It receives the user's *current list* as context, preventing it from adding duplicates if the user mentions an item already on their list.

2. **Smart Suggestions (`suggest-items` Edge Function)**:
   When the user asks *"What am I running low on?"*, the app fetches their recent `purchase_history` and sends it to Gemini. The LLM analyzes their buying patterns, ignores items they bought today, and outputs a structured JSON list of highly contextual suggestions (e.g., *"You haven't bought milk in a week"*).

---

## UI & Theme
The application features a premium, modern aesthetic built with raw CSS (no heavy utility frameworks), focusing on clean visual hierarchy and micro-animations.

- **Color Palette**: A professional **Purple & White** theme. The background is a clean `var(--bg)` white, while the primary accent is a vibrant purple (`#7c3aed`), conveying a modern and trustworthy feel.
- **Typography**: Uses the sleek `Inter` font for high legibility. The UI relies on minimal text, preferring clear iconography and whitespace to guide the user.
- **Interactive Micro-animations**: 
  - The microphone button pulses with a red expanding ring while listening.
  - When the app is processing an NLU request, the mic button morphs into a purple loading spinner.
  - Toast notifications smoothly slide up from the bottom to confirm actions.
- **Glassmorphism Prompts**: When the app needs follow-up information (like asking for a quantity), a frosted glass overlay dims the background, focusing the user's attention on the required input.
- **Responsive Design**: The app is built mobile-first, utilizing a centered max-width layout that feels like a native app on mobile devices while remaining elegant on desktop screens.
