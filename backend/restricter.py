"""
restricter.py — Validation layer that every parsed NLU action must pass through.

Enforces:
  1. Item existence   – must match a catalog keyword (fuzzy ≥ 80)
  2. Unit compat      – unit must make physical sense for that item
  3. Dozen expansion  – "dozen" / "half a dozen" → quantity multiplier, NOT a unit
  4. Negative qty     – silently rejected
  5. Upper limit      – max 10 000 in base unit per item
"""

from typing import Optional, Dict, Any, Tuple
from thefuzz import process as fuzz_process

from catalog import (
    lookup_by_keyword,
    get_all_keywords,
    resolve_unit_alias,
    CatalogItem,
    QUANTITY_MULTIPLIERS,
    UNIT_DIMENSION,
    UNIT_TO_BASE,
)


# ─── Public Result Types ──────────────────────────────────────────────

class ValidationResult:
    """Outcome of running an NLU action through the restricter."""

    def __init__(
        self,
        valid: bool,
        item_name: Optional[str] = None,
        quantity: Optional[float] = None,
        unit: Optional[str] = None,
        category: Optional[str] = None,
        reason: Optional[str] = None,
    ):
        self.valid = valid
        self.item_name = item_name
        self.quantity = quantity
        self.unit = unit
        self.category = category
        self.reason = reason          # human-readable rejection reason

    def to_dict(self) -> Dict[str, Any]:
        if self.valid:
            return {
                "valid": True,
                "item_name": self.item_name,
                "quantity": self.quantity,
                "unit": self.unit,
                "category": self.category,
            }
        return {"valid": False, "reason": self.reason}


# ─── Constants ────────────────────────────────────────────────────────

FUZZY_THRESHOLD = 80          # minimum fuzz score to accept
MAX_BASE_QUANTITY = 1_000_000 # per-item cap in base unit


# ─── Core Validation ─────────────────────────────────────────────────

def _resolve_item(raw_name: str) -> Tuple[Optional[CatalogItem], Optional[str]]:
    """
    Try exact lookup first, then fuzzy match.
    Returns (matched_item, matched_keyword) or (None, None).
    """
    raw = raw_name.lower().strip()

    # 1) Exact hit
    exact = lookup_by_keyword(raw)
    if exact:
        return exact, raw

    # 2) Fuzzy match against all keywords
    all_kws = get_all_keywords()
    if not all_kws:
        return None, None

    best, score = fuzz_process.extractOne(raw, all_kws)
    if score >= FUZZY_THRESHOLD:
        return lookup_by_keyword(best), best

    return None, None


def _expand_dozen(quantity: Optional[float], unit: Optional[str]) -> Tuple[Optional[float], Optional[str]]:
    """
    If the unit is 'dozen' or 'half a dozen', convert it into a numeric
    multiplier and set unit to 'piece'.
    """
    if unit is None:
        return quantity, unit

    raw = unit.lower().strip()

    # Check for "half a dozen" / "half dozen" first (multi-word)
    if raw in ("half a dozen", "half dozen"):
        base_qty = quantity if quantity is not None else 1
        return base_qty * 6, "piece"

    if raw in QUANTITY_MULTIPLIERS:
        multiplier = QUANTITY_MULTIPLIERS[raw]
        base_qty = quantity if quantity is not None else 1
        return base_qty * multiplier, "piece"

    return quantity, unit


def _check_unit_compat(item: CatalogItem, unit: Optional[str]) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Verify that *unit* is physically valid for *item*.
    Returns (ok, canonical_unit, rejection_reason).
    """
    if unit is None:
        # No unit spoken → use the item's default
        return True, item["default_unit"], None

    canonical = resolve_unit_alias(unit)
    if canonical is None:
        # Completely unknown unit
        valid_list = ", ".join(item["valid_units"])
        return False, None, f"'{unit}' is not a recognised unit. {item['name']} can be measured in: {valid_list}"

    if canonical not in item["valid_units"]:
        valid_list = ", ".join(item["valid_units"])
        return False, None, f"'{canonical}' is not a valid unit for {item['name']}. Valid units: {valid_list}"

    return True, canonical, None


def _check_quantity_limits(quantity: Optional[float], unit: str) -> Tuple[bool, Optional[str]]:
    """
    Reject negative quantities and enforce the 10 000-base-unit cap.
    """
    if quantity is not None and quantity <= 0:
        return False, "Quantity must be positive. Negative or zero quantities are not allowed."

    if quantity is not None:
        base_factor = UNIT_TO_BASE.get(unit, 1.0)
        base_value = quantity * base_factor
        if base_value > MAX_BASE_QUANTITY:
            return False, (
                f"Quantity too large. {quantity} {unit} exceeds the maximum "
                f"of {MAX_BASE_QUANTITY} (base unit) per item."
            )

    return True, None


# ─── Public API ───────────────────────────────────────────────────────

def validate_add_item(
    item_name: Optional[str],
    quantity: Optional[float],
    unit: Optional[str],
) -> ValidationResult:
    """
    Full validation pipeline for an ADD_ITEM action.

    Steps:
      1. Resolve item name against catalog (exact → fuzzy)
      2. Expand dozen / half-dozen into quantity × piece
      3. Validate unit compatibility
      4. Check quantity limits (negative, upper bound)
    """
    if not item_name:
        return ValidationResult(valid=False, reason="No item name provided.")

    # 1. Resolve item
    catalog_item, _matched_kw = _resolve_item(item_name)
    if catalog_item is None:
        return ValidationResult(
            valid=False,
            reason=f"'{item_name}' is not a recognised product in our catalog.",
        )

    # 2. Dozen expansion
    quantity, unit = _expand_dozen(quantity, unit)

    # 3. Unit compatibility
    unit_ok, canonical_unit, unit_reason = _check_unit_compat(catalog_item, unit)
    if not unit_ok:
        return ValidationResult(valid=False, reason=unit_reason)

    # 4. Quantity limits
    qty_ok, qty_reason = _check_quantity_limits(quantity, canonical_unit)
    if not qty_ok:
        return ValidationResult(valid=False, reason=qty_reason)

    # Default quantity to 1 if not specified
    if quantity is None:
        quantity = 1

    return ValidationResult(
        valid=True,
        item_name=catalog_item["name"],  # always canonical
        quantity=quantity,
        unit=canonical_unit,
        category=catalog_item["category"],
    )


def can_sum_units(existing_unit: str, new_unit: str) -> bool:
    """Return True if two units belong to the same dimension and can be summed."""
    dim_a = UNIT_DIMENSION.get(existing_unit)
    dim_b = UNIT_DIMENSION.get(new_unit)
    if dim_a is None or dim_b is None:
        return False
    return dim_a == dim_b


def sum_quantities(
    existing_qty: float,
    existing_unit: str,
    new_qty: float,
    new_unit: str,
) -> Tuple[float, str]:
    """
    Add two quantities that may have different units within the same dimension.
    Returns (total_quantity, display_unit).

    Examples:
      (1, "kg") + (500, "g")  →  (1500, "g")  →  displayed as (1.5, "kg")
      (200, "ml") + (1, "l")  →  (1200, "ml") →  displayed as (1.2, "l")
    """
    base_a = existing_qty * UNIT_TO_BASE.get(existing_unit, 1.0)
    base_b = new_qty * UNIT_TO_BASE.get(new_unit, 1.0)
    total_base = base_a + base_b

    # Enforce per-item cap
    if total_base > MAX_BASE_QUANTITY:
        raise ValueError(
            f"Adding {new_qty} {new_unit} would exceed the per-item limit "
            f"of {MAX_BASE_QUANTITY} base units."
        )

    dim = UNIT_DIMENSION.get(existing_unit, "count")

    # For weight / volume, pick the nicer display unit
    from catalog import DISPLAY_THRESHOLDS
    if dim in DISPLAY_THRESHOLDS:
        info = DISPLAY_THRESHOLDS[dim]
        if total_base >= info["threshold"]:
            return round(total_base / info["threshold"], 3), info["large"]
        return round(total_base, 3), info["base"]

    # Count-based: just sum as-is in whatever unit was already there
    return round(total_base, 3), existing_unit
