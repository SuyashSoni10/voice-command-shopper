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

# 6. Test Partial Removal (Removing 200g from 1.5kg of potatoes)
run_test("Partial Remove (200g of potato)", "/api/items/remove", {"item_name": "potato", "quantity": 200, "unit": "g"}, expected_in_response="'quantity': 1.3, 'unit': 'kg'")

# 7. Test Partial Removal going below zero (Removes item entirely)
run_test("Partial Remove Overdraft (Remove 2kg of potato)", "/api/items/remove", {"item_name": "potato", "quantity": 2, "unit": "kg"}, expected_in_response="'removed': True")

# 8. Verify list is correct at the end
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
