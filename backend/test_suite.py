import requests
import time

BASE_URL = "http://localhost:8000"

def run_test(name, endpoint, payload, expected_status=200, expected_in_response=None, method="POST"):
    print(f"\n--- Test: {name} ---")
    
    if method == "POST":
        res = requests.post(f"{BASE_URL}{endpoint}", json=payload)
    elif method == "DELETE":
        res = requests.delete(f"{BASE_URL}{endpoint}")
    elif method == "GET":
        res = requests.get(f"{BASE_URL}{endpoint}")
        
    print(f"Status: {res.status_code}")
    try:
        data = res.json()
        print(f"Response: {data}")
        
        if res.status_code == expected_status:
            if expected_in_response:
                # Basic string match in response to verify
                if expected_in_response in str(data):
                    print("[PASS]")
                else:
                    print(f"[FAIL] (Expected '{expected_in_response}' in response)")
            else:
                print("[PASS]")
        else:
            print(f"[FAIL] (Expected status {expected_status})")
            
    except Exception as e:
        print(f"[FAIL] Error parsing response: {e}")

# 0. Clear the list first
requests.delete(f"{BASE_URL}/api/items/clear")
print("Cleared list to start fresh.")

# 1. Test standard addition
run_test("Add 1 kg of potato", "/api/nlu", {"transcript": "add 1 kg of potato", "language": "en-US"}, expected_in_response="'quantity': 1.0, 'unit': 'kg'")
requests.post(f"{BASE_URL}/api/items", json={"item_name": "potato", "quantity": 1, "unit": "kg"})

# 2. Test cross-unit summation & aliases (g -> kg)
run_test("Add 500 g of potato (Alias Check)", "/api/nlu", {"transcript": "add 500 g of potato", "language": "en-US"}, expected_in_response="'quantity': 500.0, 'unit': 'g'")
run_test("Merge 500 g into 1 kg", "/api/items", {"item_name": "potato", "quantity": 500, "unit": "g"}, expected_in_response="'quantity': 1.5, 'unit': 'kg'")

# 3. Test Invalid Unit (liter of potato)
run_test("Invalid Unit (Liter of Potato)", "/api/items", {"item_name": "potato", "quantity": 1, "unit": "l"}, expected_status=400, expected_in_response="not a valid unit")

# 4. Test Dozen Expansion & Edge Cases
run_test("Add half a dozen eggs", "/api/nlu", {"transcript": "add half a dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 6")
requests.post(f"{BASE_URL}/api/items", json={"item_name": "egg", "quantity": 6, "unit": "piece"})

run_test("Add a half dozen eggs", "/api/nlu", {"transcript": "add a half dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 6")
run_test("Add half dozen eggs", "/api/nlu", {"transcript": "add half dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 6")
run_test("Add 0.5 dozen eggs", "/api/nlu", {"transcript": "add 0.5 dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 0.5")
run_test("Add a dozen eggs", "/api/nlu", {"transcript": "add a dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 12")
run_test("Add dozen eggs", "/api/nlu", {"transcript": "add dozen eggs", "language": "en-US"}, expected_in_response="'quantity': 12")
run_test("Add half a dozen", "/api/nlu", {"transcript": "add half a dozen", "language": "en-US"}, expected_in_response="'rejected': True")
# 5. Test Fuzzy Matching & Misspellings
run_test("Fuzzy Match (tomaato)", "/api/nlu", {"transcript": "add 2 tomaato", "language": "en-US"}, expected_in_response="'item_name': 'tomato'")
run_test("Fuzzy Match (aples)", "/api/nlu", {"transcript": "add 5 aples", "language": "en-US"}, expected_in_response="'item_name': 'apple'")
run_test("Fuzzy Match (bananana)", "/api/nlu", {"transcript": "add 1 bananana", "language": "en-US"}, expected_in_response="'item_name': 'banana'")
run_test("Fuzzy Match (potatos)", "/api/nlu", {"transcript": "add 3 potatos", "language": "en-US"}, expected_in_response="'item_name': 'potato'")

# 6. Test Partial Removal (Removing 200g from 1.5kg of potatoes)
run_test("Partial Remove (200g of potato)", "/api/items/remove", {"item_name": "potato", "quantity": 200, "unit": "g"}, expected_in_response="'quantity': 1.3, 'unit': 'kg'")

# 7. Test Partial Removal going below zero (Removes item entirely)
run_test("Partial Remove Overdraft (Remove 2kg of potato)", "/api/items/remove", {"item_name": "potato", "quantity": 2, "unit": "kg"}, expected_in_response="'removed': True")

# 7.1. Additional Partial Removal & Overdraft Tests
requests.post(f"{BASE_URL}/api/items", json={"item_name": "onion", "quantity": 2, "unit": "kg"})
run_test("Partial Remove Unit Conversion (kg -> g)", "/api/items/remove", {"item_name": "onion", "quantity": 500, "unit": "g"}, expected_in_response="'quantity': 1.5")
run_test("Exact Zero Removal Boundary", "/api/items/remove", {"item_name": "onion", "quantity": 1.5, "unit": "kg"}, expected_in_response="'removed': True")

requests.post(f"{BASE_URL}/api/items", json={"item_name": "orange", "quantity": 10, "unit": "piece"})
run_test("Partial Remove Pieces", "/api/items/remove", {"item_name": "orange", "quantity": 3, "unit": "piece"}, expected_in_response="'quantity': 7")
run_test("Partial Remove Overdraft Pieces", "/api/items/remove", {"item_name": "orange", "quantity": 20, "unit": "piece"}, expected_in_response="'removed': True")

requests.post(f"{BASE_URL}/api/items", json={"item_name": "sugar", "quantity": 1500, "unit": "g"})
run_test("Partial Remove Unit Conversion (g -> kg)", "/api/items/remove", {"item_name": "sugar", "quantity": 1, "unit": "kg"}, expected_in_response="'quantity': 500")

requests.post(f"{BASE_URL}/api/items", json={"item_name": "wheat flour", "quantity": 1, "unit": "kg"})
run_test("Mismatch Unit Removal (kg vs piece)", "/api/items/remove", {"item_name": "wheat flour", "quantity": 2, "unit": "piece"}, expected_status=400)

# 8. Test Negative Quantity Addition
run_test("Add 5 apples", "/api/items", {"item_name": "apple", "quantity": 5, "unit": "piece"}, expected_in_response="'quantity': 5")
run_test("Add -3 apples (Negative Quantity)", "/api/items", {"item_name": "apple", "quantity": -3, "unit": "piece"}, expected_status=400, expected_in_response="invalid")

# 9. Test Exact Removal Bug
run_test("Add 5 bananas", "/api/items", {"item_name": "banana", "quantity": 5, "unit": "piece"}, expected_in_response="'quantity': 5")
run_test("Remove 5 bananas (Exact Amount)", "/api/items/remove", {"item_name": "banana", "quantity": 5, "unit": "piece"}, expected_in_response="'removed': True")

# 10. Test Long Queries with 3 or 5 commands
run_test("Long Query 1 (3 adds)", "/api/nlu", {"transcript": "add one apple add two oranges add three bananas", "language": "en-US"}, expected_in_response="'item_name': 'banana'")
run_test("Long Query 2 (3 removes)", "/api/nlu", {"transcript": "remove one apple remove two oranges remove three bananas", "language": "en-US"}, expected_in_response="'intent': 'REMOVE_ITEM'")
run_test("Long Query 3 (5 adds)", "/api/nlu", {"transcript": "add milk add bread add cheese add butter add eggs", "language": "en-US"}, expected_in_response="'item_name': 'egg'")
run_test("Long Query 4 (5 removes)", "/api/nlu", {"transcript": "remove milk remove bread remove cheese remove butter remove eggs", "language": "en-US"}, expected_in_response="'item_name': 'egg'")
run_test("Long Query 5 (3 mixed)", "/api/nlu", {"transcript": "add one apple remove one orange add one banana", "language": "en-US"}, expected_in_response="'item_name': 'banana'")
run_test("Long Query 6 (5 mixed)", "/api/nlu", {"transcript": "add one apple remove one orange add milk remove bread add cheese", "language": "en-US"}, expected_in_response="'item_name': 'cheese'")
run_test("Long Query 7 (3 mixed with auxiliary)", "/api/nlu", {"transcript": "can you add one apple please remove one orange i need to add milk", "language": "en-US"}, expected_in_response="'item_name': 'milk'")
run_test("Long Query 8 (5 mixed with auxiliary)", "/api/nlu", {"transcript": "please add bread can you remove cheese i want to add butter i need to remove eggs please add juice", "language": "en-US"}, expected_in_response="'item_name': 'juice'")
run_test("Long Query 9 (3 with units)", "/api/nlu", {"transcript": "add 1 kg of potato remove 500 g of onion add 2 liters of milk", "language": "en-US"}, expected_in_response="'unit': 'l'")
run_test("Long Query 10 (5 with units)", "/api/nlu", {"transcript": "add 1 kg of sugar remove 500 g of salt add 2 liters of water remove 1 liter of juice add 1 pack of biscuits", "language": "en-US"}, expected_in_response="'item_name': 'cookie'")

# 11. Test Updates
run_test("Update Query 1 (Increase)", "/api/nlu", {"transcript": "increase apples to 5", "language": "en-US"}, expected_in_response="'intent': 'UPDATE_ITEM'")
run_test("Update Query 2 (Reduce with unit)", "/api/nlu", {"transcript": "reduce milk to 1 liter", "language": "en-US"}, expected_in_response="'intent': 'UPDATE_ITEM'")

# 12. Test Swaps (Replace)
run_test("Swap Query 1 (Swap for)", "/api/nlu", {"transcript": "swap apples for bananas", "language": "en-US"}, expected_in_response="'intent': 'ADD_ITEM'")
run_test("Swap Query 2 (Instead of get)", "/api/nlu", {"transcript": "instead of milk, get water", "language": "en-US"}, expected_in_response="'intent': 'REMOVE_ITEM'")

# 13. Verify list is correct at the end
run_test("Verify Final List State", "/api/items", None, method="GET")

print("\n--- TEST RUN COMPLETE ---")

import asyncio
import requests

async def add_concurrently_async():
    return await asyncio.to_thread(
        requests.post, 
        f"{BASE_URL}/api/items", 
        json={"item_name": "potato", "quantity": 1, "unit": "kg"}, 
        headers={"X-Session-ID": "concurrent_test"}
    )

async def run_concurrency_test():
    requests.delete(f"{BASE_URL}/api/items/clear", headers={"X-Session-ID": "concurrent_test"})
    results = await asyncio.gather(*(add_concurrently_async() for _ in range(10)))
    
    for res in results:
        if res.status_code != 200:
            print("Concurrent add failed", res.status_code)

    res = requests.get(f"{BASE_URL}/api/items", headers={"X-Session-ID": "concurrent_test"})
    items = res.json()
    if len(items) > 0 and items[0].get('quantity') == 10.0:
        print("\n[PASS] Concurrency lock worked.")
    else:
        print(f"\n[FAIL] Race condition detected. Quantity: {items[0].get('quantity') if items else 'None'}")

asyncio.run(run_concurrency_test())
