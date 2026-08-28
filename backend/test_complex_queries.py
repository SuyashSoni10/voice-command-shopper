import requests
import json
import sys

URL = "http://localhost:8000/api/nlu"

complex_tests = [
    "I need to add 3 boxes of cereal, 2 packs of cookies, and one loaf of bread.",
    "Please add 500 grams of flour and 1.5 kilograms of sugar.",
    "Remove the bread and take off the packs of cookies.",
    "Add half a dozen of eggs.",
    "Delete the eggs and remove one liter of milk.",
    "Decrease sugar by 1 kilogram.",
    "Add five KG of cereal."
]

def run_tests():
    print("==================================================")
    print("  RUNNING COMPLEX LONG COMMAND NLU TESTS")
    print("==================================================")
    
    passed = 0
    failed = 0
    
    for idx, query in enumerate(complex_tests, 1):
        print(f"\n[Test {idx}] Query: \"{query}\"")
        try:
            res = requests.post(URL, json={"transcript": query, "language": "en"})
            res.raise_for_status()
            data = res.json()
            
            actions = data.get("actions", [])
            print(f"  -> Found {len(actions)} intent(s):")
            
            all_valid = True
            for action in actions:
                intent = action.get("intent")
                item = action.get("entities", {}).get("item_name")
                qty = action.get("entities", {}).get("quantity")
                unit = action.get("entities", {}).get("unit")
                rejected = action.get("entities", {}).get("rejected")
                
                if rejected:
                    print(f"     [FAIL] {intent}: {item} (REJECTED: {action['entities'].get('rejection_reason')})")
                    all_valid = False
                elif intent == "UNKNOWN":
                    print(f"     [FAIL] {intent}")
                    all_valid = False
                else:
                    print(f"     [PASS] {intent}: {qty} {unit if unit else ''} of '{item}'")
                    
            if all_valid and len(actions) > 0:
                print("  STATUS: PASS")
                passed += 1
            else:
                print("  STATUS: FAIL")
                failed += 1
                
        except Exception as e:
            print(f"  -> Request Failed: {e}")
            print("  STATUS: FAIL")
            failed += 1
            
    print("\n==================================================")
    print(f"  RESULTS: {passed} PASSED, {failed} FAILED")
    print("==================================================")
    
    if failed > 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    run_tests()
