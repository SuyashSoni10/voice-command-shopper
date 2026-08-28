"""
catalog.py — Single source of truth for every item the store recognises.

Each item carries:
  • name          – canonical singular lowercase name
  • keywords      – aliases / plurals that all resolve to this item
  • valid_units   – which metric units make physical sense
  • default_unit  – unit assumed when the user doesn't specify one
  • category      – which shelf it lives on
"""

from typing import Dict, List, TypedDict, Optional

# ─── Unit Definitions ────────────────────────────────────────────────
# Every recognised unit and its conversion factor to the base unit
# within its *dimension*.  Base units: gram (weight), ml (volume), piece (count).

UNIT_ALIASES: Dict[str, str] = {
    # Weight
    "kg": "kg", "kilogram": "kg", "kilograms": "kg", "kilo": "kg", "kilos": "kg",
    "g": "g", "gram": "g", "grams": "g", "gm": "g",
    # Volume
    "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml",
    # Count-based
    "piece": "piece", "pieces": "piece", "pc": "piece", "pcs": "piece",
    "pack": "pack", "packs": "pack", "packet": "pack", "packets": "pack",
    "bottle": "bottle", "bottles": "bottle",
    "can": "can", "cans": "can",
    "box": "box", "boxes": "box",
    "bag": "bag", "bags": "bag",
    "loaf": "loaf", "loaves": "loaf",
    "bunch": "bunch", "bunches": "bunch",
    "tray": "tray", "trays": "tray",
    "carton": "carton", "cartons": "carton",
    "jar": "jar", "jars": "jar",
    "tube": "tube", "tubes": "tube",
    "roll": "roll", "rolls": "roll",
    "bar": "bar", "bars": "bar",
    "stick": "stick", "sticks": "stick",
    "slab": "slab", "slabs": "slab",
    "sachet": "sachet", "sachets": "sachet",
    "pouch": "pouch", "pouches": "pouch",
}

# Conversion to base unit (g for weight, ml for volume, 1 for count)
UNIT_TO_BASE: Dict[str, float] = {
    "kg": 1000.0,   # 1 kg = 1000 g
    "kilogram": 1000.0,
    "kilo": 1000.0,
    "g": 1.0,
    "gram": 1.0,
    "l": 1000.0,    # 1 l = 1000 ml
    "liter": 1000.0,
    "litre": 1000.0,
    "ml": 1.0,
    "piece": 1.0,
    "pack": 1.0,
    "bottle": 1.0,
    "can": 1.0,
    "box": 1.0,
    "bag": 1.0,
    "loaf": 1.0,
    "bunch": 1.0,
    "tray": 1.0,
    "carton": 1.0,
    "jar": 1.0,
    "tube": 1.0,
    "roll": 1.0,
    "bar": 1.0,
    "stick": 1.0,
    "slab": 1.0,
    "sachet": 1.0,
    "pouch": 1.0,
}

# Which dimension each unit belongs to — used to check convertibility
UNIT_DIMENSION: Dict[str, str] = {
    "kg": "weight", "kilogram": "weight", "kilo": "weight", "g": "weight", "gram": "weight",
    "l": "volume", "liter": "volume", "litre": "volume", "ml": "volume",
    "piece": "count", "pack": "count", "bottle": "count",
    "can": "count", "box": "count", "bag": "count",
    "loaf": "count", "bunch": "count", "tray": "count",
    "carton": "count", "jar": "count", "tube": "count",
    "roll": "count", "bar": "count", "stick": "count",
    "slab": "count", "sachet": "count", "pouch": "count",
}

# Preferred display unit for each dimension (use larger unit when ≥ threshold)
DISPLAY_THRESHOLDS = {
    "weight": {"base": "g", "large": "kg", "threshold": 1000.0},
    "volume": {"base": "ml", "large": "l", "threshold": 1000.0},
}

# Quantity words that are NOT units but quantity multipliers
QUANTITY_MULTIPLIERS: Dict[str, float] = {
    "dozen": 12.0,
    "half a dozen": 6.0,
    "half dozen": 6.0,
    "couple": 2.0,
}


# ─── Item Type ────────────────────────────────────────────────────────

class CatalogItem(TypedDict):
    name: str
    keywords: List[str]
    valid_units: List[str]
    default_unit: str
    category: str


def _item(name: str, keywords: List[str], valid_units: List[str],
          default_unit: str, category: str) -> CatalogItem:
    """Helper to build a catalog entry with the name always in keywords."""
    all_kw = list(set([name] + keywords))
    return CatalogItem(
        name=name,
        keywords=all_kw,
        valid_units=valid_units,
        default_unit=default_unit,
        category=category,
    )


# ─── Weight / Volume / Count shorthand lists ─────────────────────────
_W   = ["kg", "g"]                      # weight items
_WP  = ["kg", "g", "piece"]             # weight or piece (e.g. potato: 1 piece or 2 kg)
_V   = ["l", "ml"]                      # volume items
_VB  = ["l", "ml", "bottle", "carton"]  # volume + containers
_P   = ["piece"]                        # pure count
_PP  = ["piece", "pack"]                # piece or pack
_PBx = ["piece", "box", "pack"]         # piece / box / pack
_Bag = ["kg", "g", "bag", "pack"]       # bag items (grains, flour)
_Loaf = ["loaf", "piece"]               # bread-like
_Bunch = ["bunch", "piece"]             # herbs
_Can  = ["can", "bottle", "piece", "pack"]  # canned goods


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 1 — DAIRY  (30 items)
# ═══════════════════════════════════════════════════════════════════════
DAIRY: List[CatalogItem] = [
    _item("milk",             ["milks", "doodh"],                        _VB,  "l",      "dairy"),
    _item("butter",           ["butters", "makhan"],                     _WP,  "piece",  "dairy"),
    _item("cheese",           ["cheeses", "paneer cheese"],              _WP,  "piece",  "dairy"),
    _item("yogurt",           ["yogurts", "curd", "dahi"],               _VB,  "piece",  "dairy"),
    _item("cream",            ["creams", "fresh cream", "malai"],        _VB,  "ml",     "dairy"),
    _item("paneer",           ["paneers", "cottage cheese"],             _WP,  "piece",  "dairy"),
    _item("ghee",             ["ghees", "clarified butter"],             _VB,  "bottle", "dairy"),
    _item("buttermilk",       ["buttermilks", "chaas", "chaach"],        _VB,  "l",      "dairy"),
    _item("sour cream",       ["sour creams"],                           _VB,  "piece",  "dairy"),
    _item("whipped cream",    ["whipped creams"],                        _VB,  "piece",  "dairy"),
    _item("cream cheese",     ["cream cheeses", "philadelphia"],         _WP,  "piece",  "dairy"),
    _item("mozzarella",       ["mozzarellas", "mozzarella cheese"],      _WP,  "piece",  "dairy"),
    _item("cheddar",          ["cheddars", "cheddar cheese"],            _WP,  "piece",  "dairy"),
    _item("parmesan",         ["parmesans", "parmesan cheese"],          _WP,  "piece",  "dairy"),
    _item("ricotta",          ["ricottas", "ricotta cheese"],            _WP,  "piece",  "dairy"),
    _item("condensed milk",   ["condensed milks"],                       _Can, "can",    "dairy"),
    _item("evaporated milk",  ["evaporated milks"],                      _Can, "can",    "dairy"),
    _item("skimmed milk",     ["skimmed milks", "skim milk"],            _VB,  "l",      "dairy"),
    _item("almond milk",      ["almond milks"],                          _VB,  "l",      "dairy"),
    _item("soy milk",         ["soy milks", "soya milk"],                _VB,  "l",      "dairy"),
    _item("oat milk",         ["oat milks"],                             _VB,  "l",      "dairy"),
    _item("coconut milk",     ["coconut milks"],                         _VB,  "can",    "dairy"),
    _item("ice cream",        ["ice creams"],                            ["l", "ml", "tub", "piece"], "piece", "dairy"),
    _item("khoya",            ["khoyas", "mawa", "khoa"],                _WP,  "g",      "dairy"),
    _item("lassi",            ["lassis"],                                _VB,  "bottle", "dairy"),
    _item("milkshake",        ["milkshakes"],                            _VB,  "bottle", "dairy"),
    _item("flavored milk",    ["flavored milks", "flavoured milk"],      _VB,  "bottle", "dairy"),
    _item("cottage cheese",   ["cottage cheeses"],                       _WP,  "piece",  "dairy"),
    _item("gouda",            ["goudas", "gouda cheese"],                _WP,  "piece",  "dairy"),
    _item("feta",             ["fetas", "feta cheese"],                  _WP,  "piece",  "dairy"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 2 — FRUITS  (30 items)
# ═══════════════════════════════════════════════════════════════════════
FRUITS: List[CatalogItem] = [
    _item("apple",       ["apples", "seb"],                    _WP, "piece", "fruits"),
    _item("banana",      ["bananas", "kela"],                  _WP, "piece", "fruits"),
    _item("orange",      ["oranges", "santra", "narangi"],     _WP, "piece", "fruits"),
    _item("mango",       ["mangoes", "mangos", "aam"],         _WP, "piece", "fruits"),
    _item("grape",       ["grapes", "angur", "angoor"],        _WP, "kg",    "fruits"),
    _item("strawberry",  ["strawberries"],                     _WP, "piece", "fruits"),
    _item("blueberry",   ["blueberries"],                      _WP, "piece", "fruits"),
    _item("raspberry",   ["raspberries"],                      _WP, "piece", "fruits"),
    _item("watermelon",  ["watermelons", "tarbooz"],           _WP, "piece", "fruits"),
    _item("pineapple",   ["pineapples", "ananas"],             _WP, "piece", "fruits"),
    _item("papaya",      ["papayas", "papita"],                _WP, "piece", "fruits"),
    _item("pomegranate", ["pomegranates", "anaar", "anar"],    _WP, "piece", "fruits"),
    _item("guava",       ["guavas", "amrood", "amrud"],        _WP, "piece", "fruits"),
    _item("lychee",      ["lychees", "litchi", "lichis"],      _WP, "piece", "fruits"),
    _item("kiwi",        ["kiwis", "kiwifruit"],               _WP, "piece", "fruits"),
    _item("peach",       ["peaches", "aadu"],                  _WP, "piece", "fruits"),
    _item("plum",        ["plums", "aloo bukhara"],            _WP, "piece", "fruits"),
    _item("pear",        ["pears", "nashpati"],                _WP, "piece", "fruits"),
    _item("cherry",      ["cherries"],                         _WP, "piece", "fruits"),
    _item("coconut",     ["coconuts", "nariyal"],              _WP, "piece", "fruits"),
    _item("fig",         ["figs", "anjeer"],                   _WP, "piece", "fruits"),
    _item("date",        ["dates", "khajoor", "khajur"],       _WP, "piece", "fruits"),
    _item("avocado",     ["avocados"],                         _WP, "piece", "fruits"),
    _item("lemon",       ["lemons", "nimbu"],                  _WP, "piece", "fruits"),
    _item("lime",        ["limes"],                            _WP, "piece", "fruits"),
    _item("jackfruit",   ["jackfruits", "kathal"],             _WP, "piece", "fruits"),
    _item("custard apple", ["custard apples", "sitaphal", "sharifa"], _WP, "piece", "fruits"),
    _item("dragon fruit",  ["dragon fruits", "pitaya"],        _WP, "piece", "fruits"),
    _item("passion fruit", ["passion fruits"],                 _WP, "piece", "fruits"),
    _item("cantaloupe",    ["cantaloupes", "kharbooja"],       _WP, "piece", "fruits"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 3 — MEAT  (30 items)
# ═══════════════════════════════════════════════════════════════════════
MEAT: List[CatalogItem] = [
    _item("chicken",        ["chickens", "murgi", "murgh"],                _W,  "kg", "meat"),
    _item("chicken breast",  ["chicken breasts"],                          _W,  "kg", "meat"),
    _item("chicken thigh",   ["chicken thighs"],                           _W,  "kg", "meat"),
    _item("chicken wing",    ["chicken wings"],                            _WP, "kg", "meat"),
    _item("chicken drumstick", ["chicken drumsticks", "chicken leg"],      _WP, "kg", "meat"),
    _item("minced chicken",  ["minced chickens", "chicken mince", "chicken keema"], _W, "kg", "meat"),
    _item("mutton",          ["muttons", "goat meat", "bakra"],            _W,  "kg", "meat"),
    _item("lamb",            ["lambs", "lamb meat"],                       _W,  "kg", "meat"),
    _item("pork",            ["porks"],                                    _W,  "kg", "meat"),
    _item("bacon",           ["bacons"],                                   _WP, "pack", "meat"),
    _item("ham",             ["hams"],                                     _WP, "pack", "meat"),
    _item("sausage",         ["sausages"],                                 _WP, "pack", "meat"),
    _item("salami",          ["salamis"],                                  _WP, "pack", "meat"),
    _item("beef",            ["beefs", "beef meat"],                       _W,  "kg", "meat"),
    _item("steak",           ["steaks", "beef steak"],                     _WP, "piece", "meat"),
    _item("fish",            ["fishes", "machli", "machhi"],               _W,  "kg", "meat"),
    _item("salmon",          ["salmons"],                                  _W,  "kg", "meat"),
    _item("tuna",            ["tunas"],                                    _W,  "kg", "meat"),
    _item("shrimp",          ["shrimps", "prawn", "prawns", "jhinga"],     _W,  "kg", "meat"),
    _item("crab",            ["crabs", "kekda"],                           _WP, "kg", "meat"),
    _item("lobster",         ["lobsters"],                                 _WP, "piece", "meat"),
    _item("turkey",          ["turkeys"],                                  _W,  "kg", "meat"),
    _item("duck",            ["ducks"],                                    _W,  "kg", "meat"),
    _item("egg",             ["eggs", "anda", "ande"],                     _PP, "piece", "meat"),
    _item("quail egg",       ["quail eggs"],                               _PP, "piece", "meat"),
    _item("liver",           ["livers", "kaleji"],                         _W,  "kg", "meat"),
    _item("kidney",          ["kidneys", "gurda"],                         _W,  "kg", "meat"),
    _item("minced meat",     ["minced meats", "keema", "mince"],           _W,  "kg", "meat"),
    _item("pepperoni",       ["pepperonis"],                               _WP, "pack", "meat"),
    _item("hot dog",         ["hot dogs", "frankfurter", "frankfurters"],  _WP, "pack", "meat"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 4 — UTILITIES  (30 items)
# ═══════════════════════════════════════════════════════════════════════
UTILITIES: List[CatalogItem] = [
    _item("dish soap",       ["dish soaps", "dishwashing liquid", "bartan soap"],   ["bottle", "piece"], "bottle", "utilities"),
    _item("laundry detergent", ["laundry detergents", "washing powder", "surf"],    ["kg", "g", "pack", "bag", "bottle"], "pack", "utilities"),
    _item("fabric softener", ["fabric softeners"],                                  ["bottle", "pouch"], "bottle", "utilities"),
    _item("sponge",          ["sponges", "scrubber", "scrubbers"],                  _PP, "piece", "utilities"),
    _item("trash bag",       ["trash bags", "garbage bags", "dustbin bags"],        _PP, "pack",  "utilities"),
    _item("aluminum foil",   ["aluminum foils", "aluminium foil", "foil"],          ["roll", "piece"], "roll", "utilities"),
    _item("plastic wrap",    ["plastic wraps", "cling film", "cling wrap"],         ["roll", "piece"], "roll", "utilities"),
    _item("paper towel",     ["paper towels", "kitchen tissue", "kitchen towel"],   ["roll", "pack"], "roll", "utilities"),
    _item("toilet paper",    ["toilet papers", "tissue roll", "tissue paper"],      ["roll", "pack"], "roll", "utilities"),
    _item("hand soap",       ["hand soaps", "handwash"],                            ["bottle", "pouch", "piece"], "bottle", "utilities"),
    _item("shampoo",         ["shampoos"],                                          ["bottle", "sachet", "pouch"], "bottle", "utilities"),
    _item("conditioner",     ["conditioners", "hair conditioner"],                  ["bottle", "sachet"], "bottle", "utilities"),
    _item("toothpaste",      ["toothpastes"],                                       ["tube", "piece"], "tube", "utilities"),
    _item("toothbrush",      ["toothbrushes"],                                      _PP, "piece", "utilities"),
    _item("mouthwash",       ["mouthwashes"],                                       ["bottle", "piece"], "bottle", "utilities"),
    _item("deodorant",       ["deodorants", "deo"],                                 ["piece", "can"], "piece", "utilities"),
    _item("razor",           ["razors"],                                            _PP, "pack", "utilities"),
    _item("cotton pad",      ["cotton pads", "cotton balls"],                       _PP, "pack", "utilities"),
    _item("band aid",        ["band aids", "bandage", "bandages"],                  _PP, "pack", "utilities"),
    _item("sanitizer",       ["sanitizers", "hand sanitizer"],                      ["bottle", "piece"], "bottle", "utilities"),
    _item("face wash",       ["face washes"],                                       ["tube", "bottle", "piece"], "tube", "utilities"),
    _item("sunscreen",       ["sunscreens"],                                        ["tube", "bottle", "piece"], "tube", "utilities"),
    _item("body lotion",     ["body lotions", "moisturizer", "moisturiser"],        ["bottle", "tube", "piece"], "bottle", "utilities"),
    _item("floor cleaner",   ["floor cleaners", "phenyl"],                          ["bottle", "pouch"], "bottle", "utilities"),
    _item("glass cleaner",   ["glass cleaners", "colin"],                           ["bottle", "piece"], "bottle", "utilities"),
    _item("bleach",          ["bleaches"],                                          ["bottle", "piece"], "bottle", "utilities"),
    _item("matchbox",        ["matchboxes", "matches", "match sticks"],             _PBx, "box", "utilities"),
    _item("candle",          ["candles"],                                           _PP, "piece", "utilities"),
    _item("battery",         ["batteries"],                                         _PP, "pack", "utilities"),
    _item("light bulb",      ["light bulbs", "bulb", "bulbs"],                      _PP, "piece", "utilities"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 5 — BEVERAGES  (30 items)
# ═══════════════════════════════════════════════════════════════════════
BEVERAGES: List[CatalogItem] = [
    _item("water",           ["waters", "paani"],                                   ["bottle", "l", "ml", "can", "pack"], "bottle", "beverages"),
    _item("tea",             ["teas", "chai"],                                      _Bag, "pack", "beverages"),
    _item("coffee",          ["coffees"],                                           _Bag, "pack", "beverages"),
    _item("green tea",       ["green teas"],                                        _PBx, "box", "beverages"),
    _item("herbal tea",      ["herbal teas"],                                       _PBx, "box", "beverages"),
    _item("orange juice",    ["orange juices", "oj"],                               _VB, "bottle", "beverages"),
    _item("apple juice",     ["apple juices"],                                      _VB, "bottle", "beverages"),
    _item("mango juice",     ["mango juices"],                                      _VB, "bottle", "beverages"),
    _item("mixed fruit juice", ["mixed fruit juices"],                              _VB, "bottle", "beverages"),
    _item("lemonade",        ["lemonades", "nimbu pani"],                           _VB, "bottle", "beverages"),
    _item("cola",            ["colas", "coke", "coca cola", "pepsi"],               _Can, "can", "beverages"),
    _item("soda",            ["sodas", "soda water", "sparkling water"],            _Can, "bottle", "beverages"),
    _item("energy drink",    ["energy drinks", "red bull", "monster"],              _Can, "can", "beverages"),
    _item("sports drink",    ["sports drinks", "gatorade", "electral"],             _Can, "bottle", "beverages"),
    _item("coconut water",   ["coconut waters", "nariyal paani"],                   _Can, "bottle", "beverages"),
    _item("tonic water",     ["tonic waters"],                                      _Can, "bottle", "beverages"),
    _item("iced tea",        ["iced teas"],                                         _Can, "bottle", "beverages"),
    _item("hot chocolate",   ["hot chocolates", "cocoa"],                           _Bag, "pack", "beverages"),
    _item("protein shake",   ["protein shakes", "whey protein"],                    ["bottle", "pack", "piece"], "pack", "beverages"),
    _item("milkshake mix",   ["milkshake mixes"],                                  _PP, "pack", "beverages"),
    _item("instant coffee",  ["instant coffees", "nescafe"],                        ["jar", "pack", "sachet"], "jar", "beverages"),
    _item("filter coffee",   ["filter coffees", "kaapi"],                           _Bag, "pack", "beverages"),
    _item("beer",            ["beers"],                                             _Can, "can", "beverages"),
    _item("wine",            ["wines"],                                             ["bottle", "piece"], "bottle", "beverages"),
    _item("whiskey",         ["whiskeys", "whisky", "whiskies"],                    ["bottle", "piece"], "bottle", "beverages"),
    _item("vodka",           ["vodkas"],                                            ["bottle", "piece"], "bottle", "beverages"),
    _item("rum",             ["rums"],                                              ["bottle", "piece"], "bottle", "beverages"),
    _item("gin",             ["gins"],                                              ["bottle", "piece"], "bottle", "beverages"),
    _item("tequila",         ["tequilas"],                                          ["bottle", "piece"], "bottle", "beverages"),
    _item("kombucha",        ["kombuchas"],                                         ["bottle", "can"], "bottle", "beverages"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 6 — BAKERY  (30 items)
# ═══════════════════════════════════════════════════════════════════════
BAKERY: List[CatalogItem] = [
    _item("bread",           ["breads", "roti", "pav"],                   _Loaf, "loaf", "bakery"),
    _item("white bread",     ["white breads"],                            _Loaf, "loaf", "bakery"),
    _item("brown bread",     ["brown breads", "whole wheat bread"],       _Loaf, "loaf", "bakery"),
    _item("multigrain bread",["multigrain breads"],                       _Loaf, "loaf", "bakery"),
    _item("baguette",        ["baguettes"],                               _Loaf, "piece", "bakery"),
    _item("croissant",       ["croissants"],                              _PP,   "piece", "bakery"),
    _item("muffin",          ["muffins"],                                 _PP,   "piece", "bakery"),
    _item("donut",           ["donuts", "doughnut", "doughnuts"],         _PP,   "piece", "bakery"),
    _item("cake",            ["cakes"],                                   _WP,   "piece", "bakery"),
    _item("cupcake",         ["cupcakes"],                                _PP,   "piece", "bakery"),
    _item("cookie",          ["cookies", "biscuit", "biscuits"],          _PP,   "pack",  "bakery"),
    _item("brownie",         ["brownies"],                                _PP,   "piece", "bakery"),
    _item("pastry",          ["pastries"],                                _PP,   "piece", "bakery"),
    _item("pie",             ["pies"],                                    _PP,   "piece", "bakery"),
    _item("pizza base",      ["pizza bases", "pizza dough"],              _PP,   "piece", "bakery"),
    _item("tortilla",        ["tortillas", "wrap", "wraps"],              _PP,   "pack",  "bakery"),
    _item("naan",            ["naans", "nan"],                            _PP,   "piece", "bakery"),
    _item("pita",            ["pitas", "pita bread"],                     _PP,   "pack",  "bakery"),
    _item("bagel",           ["bagels"],                                  _PP,   "piece", "bakery"),
    _item("scone",           ["scones"],                                  _PP,   "piece", "bakery"),
    _item("waffle",          ["waffles"],                                 _PP,   "piece", "bakery"),
    _item("pancake mix",     ["pancake mixes"],                           _Bag,  "pack",  "bakery"),
    _item("rusk",            ["rusks"],                                   _PP,   "pack",  "bakery"),
    _item("breadstick",      ["breadsticks"],                             _PP,   "pack",  "bakery"),
    _item("cracker",         ["crackers"],                                _PP,   "pack",  "bakery"),
    _item("pretzel",         ["pretzels"],                                _PP,   "pack",  "bakery"),
    _item("cinnamon roll",   ["cinnamon rolls"],                          _PP,   "piece", "bakery"),
    _item("danish pastry",   ["danish pastries"],                         _PP,   "piece", "bakery"),
    _item("eclair",          ["eclairs"],                                 _PP,   "piece", "bakery"),
    _item("puff pastry",     ["puff pastries"],                           _PP,   "pack",  "bakery"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 7 — PANTRY  (30 items)
# ═══════════════════════════════════════════════════════════════════════
PANTRY: List[CatalogItem] = [
    _item("rice",            ["rices", "chawal", "basmati", "basmati rice"],  _Bag, "kg",   "pantry"),
    _item("wheat flour",     ["wheat flours", "atta", "gehu ka atta", "flour"],       _Bag, "kg",   "pantry"),
    _item("all purpose flour", ["maida", "refined flour"],                   _Bag, "kg",   "pantry"),
    _item("cereal",          ["cereals", "corn flakes", "oats"],             ["box", "pack", "bag", "kg", "g"], "box",  "pantry"),
    _item("sugar",           ["sugars", "cheeni"],                           _Bag, "kg",   "pantry"),
    _item("salt",            ["salts", "namak"],                             _Bag, "kg",   "pantry"),
    _item("cooking oil",     ["cooking oils", "oil", "vegetable oil"],       _VB,  "l",    "pantry"),
    _item("olive oil",       ["olive oils"],                                 _VB,  "bottle","pantry"),
    _item("mustard oil",     ["mustard oils", "sarson ka tel"],              _VB,  "bottle","pantry"),
    _item("coconut oil",     ["coconut oils", "nariyal tel"],                _VB,  "bottle","pantry"),
    _item("vinegar",         ["vinegars"],                                   _VB,  "bottle","pantry"),
    _item("soy sauce",       ["soy sauces"],                                _VB,  "bottle","pantry"),
    _item("tomato ketchup",  ["tomato ketchups", "ketchup", "sauce"],       ["bottle", "pouch", "piece"], "bottle", "pantry"),
    _item("chili sauce",     ["chili sauces", "hot sauce"],                 ["bottle", "piece"], "bottle", "pantry"),
    _item("mayonnaise",      ["mayonnaises", "mayo"],                       ["bottle", "jar", "pouch"], "bottle", "pantry"),
    _item("pasta",           ["pastas", "penne", "spaghetti", "macaroni"], _Bag,   "pack",  "pantry"),
    _item("noodle",          ["noodles", "maggi"],                          _PP,    "pack",  "pantry"),
    _item("oats",            ["oat", "oatmeal", "rolled oats"],            _Bag,   "pack",  "pantry"),
    _item("cornflakes",      ["cornflake", "corn flakes"],                 _PBx,   "box",   "pantry"),
    _item("muesli",          ["mueslis", "granola"],                       _Bag,   "pack",  "pantry"),
    _item("honey",           ["honeys", "shahad"],                         ["bottle", "jar", "piece"], "bottle", "pantry"),
    _item("jam",             ["jams"],                                     ["bottle", "jar", "piece"], "jar",    "pantry"),
    _item("peanut butter",   ["peanut butters"],                           ["jar", "bottle", "piece"], "jar",    "pantry"),
    _item("nutella",         ["nutellas", "chocolate spread"],             ["jar", "piece"], "jar",    "pantry"),
    _item("pickle",          ["pickles", "achar"],                         ["jar", "bottle", "piece"], "jar",    "pantry"),
    _item("papad",           ["papads", "papadum", "papadums"],            _PP,    "pack",  "pantry"),
    _item("baking powder",   ["baking powders"],                           _Bag,   "pack",  "pantry"),
    _item("baking soda",     ["baking sodas"],                             _Bag,   "pack",  "pantry"),
    _item("yeast",           ["yeasts"],                                   _Bag,   "pack",  "pantry"),
    _item("cocoa powder",    ["cocoa powders"],                            _Bag,   "pack",  "pantry"),
    _item("cornstarch",      ["cornstarches", "corn flour", "corn starch"], _Bag,  "pack",  "pantry"),
]


# ═══════════════════════════════════════════════════════════════════════
# CATEGORY 8 — UNCATEGORIZED  (90 items)
# ═══════════════════════════════════════════════════════════════════════
UNCATEGORIZED: List[CatalogItem] = [
    # Vegetables (35)
    _item("potato",      ["potatoes", "aloo"],               _WP, "kg",    "uncategorized"),
    _item("tomato",      ["tomatoes", "tamatar"],             _WP, "kg",    "uncategorized"),
    _item("onion",       ["onions", "pyaaz", "pyaz"],         _WP, "kg",    "uncategorized"),
    _item("garlic",      ["garlics", "lahsun"],               _WP, "piece", "uncategorized"),
    _item("ginger",      ["gingers", "adrak"],                _WP, "piece", "uncategorized"),
    _item("carrot",      ["carrots", "gajar"],                _WP, "kg",    "uncategorized"),
    _item("cucumber",    ["cucumbers", "kheera", "khira"],    _WP, "piece", "uncategorized"),
    _item("spinach",     ["spinaches", "palak"],              _Bunch, "bunch", "uncategorized"),
    _item("cabbage",     ["cabbages", "patta gobi"],          _WP, "piece", "uncategorized"),
    _item("cauliflower", ["cauliflowers", "gobi", "phool gobi"], _WP, "piece", "uncategorized"),
    _item("broccoli",    ["broccolis"],                       _WP, "piece", "uncategorized"),
    _item("capsicum",    ["capsicums", "bell pepper", "bell peppers", "shimla mirch"], _WP, "piece", "uncategorized"),
    _item("green chili", ["green chilis", "green chilli", "hari mirch"],  _WP, "piece", "uncategorized"),
    _item("mushroom",    ["mushrooms"],                       _WP, "pack",  "uncategorized"),
    _item("peas",        ["pea", "matar", "green peas"],      _WP, "kg",    "uncategorized"),
    _item("corn",        ["corns", "maize", "makka", "sweet corn"], _WP, "piece", "uncategorized"),
    _item("eggplant",    ["eggplants", "brinjal", "baingan", "aubergine"], _WP, "piece", "uncategorized"),
    _item("okra",        ["okras", "bhindi", "lady finger"],  _WP, "kg",    "uncategorized"),
    _item("bitter gourd",["bitter gourds", "karela"],         _WP, "kg",    "uncategorized"),
    _item("bottle gourd",["bottle gourds", "lauki", "ghiya"], _WP, "piece", "uncategorized"),
    _item("pumpkin",     ["pumpkins", "kaddu"],                _WP, "piece", "uncategorized"),
    _item("sweet potato",["sweet potatoes", "shakarkand", "shakarkandi"], _WP, "kg", "uncategorized"),
    _item("beetroot",    ["beetroots", "chukandar"],           _WP, "kg",    "uncategorized"),
    _item("radish",      ["radishes", "mooli"],                _WP, "piece", "uncategorized"),
    _item("turnip",      ["turnips", "shalgam"],               _WP, "piece", "uncategorized"),
    _item("zucchini",    ["zucchinis", "courgette"],           _WP, "piece", "uncategorized"),
    _item("lettuce",     ["lettuces"],                         _WP, "piece", "uncategorized"),
    _item("celery",      ["celeries"],                         _Bunch, "bunch", "uncategorized"),
    _item("spring onion",["spring onions", "green onion", "green onions", "scallion"], _Bunch, "bunch", "uncategorized"),
    _item("coriander",   ["corianders", "cilantro", "dhania", "dhaniya"], _Bunch, "bunch", "uncategorized"),
    _item("mint",        ["mints", "pudina"],                  _Bunch, "bunch", "uncategorized"),
    _item("curry leaf",  ["curry leaves", "kadi patta"],       _Bunch, "bunch", "uncategorized"),
    _item("parsley",     ["parsleys"],                         _Bunch, "bunch", "uncategorized"),
    _item("basil",       ["basils", "tulsi"],                  _Bunch, "bunch", "uncategorized"),
    _item("asparagus",   ["asparaguses"],                      _Bunch, "bunch", "uncategorized"),
    # Spices (20)
    _item("turmeric",    ["turmerics", "haldi"],               _Bag,  "pack", "uncategorized"),
    _item("red chili powder", ["red chili powders", "lal mirch"], _Bag, "pack", "uncategorized"),
    _item("cumin",       ["cumins", "jeera", "zeera"],         _Bag,  "pack", "uncategorized"),
    _item("coriander powder", ["coriander powders", "dhania powder"], _Bag, "pack", "uncategorized"),
    _item("garam masala",["garam masalas"],                    _Bag,  "pack", "uncategorized"),
    _item("black pepper",["black peppers", "kali mirch"],      _Bag,  "pack", "uncategorized"),
    _item("cinnamon",    ["cinnamons", "dalchini"],            _Bag,  "pack", "uncategorized"),
    _item("cardamom",    ["cardamoms", "elaichi", "ilaychi"],  _Bag,  "pack", "uncategorized"),
    _item("clove",       ["cloves", "laung", "lavang"],        _Bag,  "pack", "uncategorized"),
    _item("bay leaf",    ["bay leaves", "tej patta"],          _Bag,  "pack", "uncategorized"),
    _item("mustard seed",["mustard seeds", "rai", "sarson"],   _Bag,  "pack", "uncategorized"),
    _item("fennel",      ["fennels", "saunf"],                 _Bag,  "pack", "uncategorized"),
    _item("fenugreek",   ["fenugreeks", "methi", "methi seeds"], _Bag, "pack", "uncategorized"),
    _item("asafoetida",  ["asafoetidas", "hing"],              _Bag,  "pack", "uncategorized"),
    _item("oregano",     ["oreganos"],                         _Bag,  "pack", "uncategorized"),
    _item("thyme",       ["thymes"],                           _Bag,  "pack", "uncategorized"),
    _item("rosemary",    ["rosemarys", "rosemaries"],          _Bag,  "pack", "uncategorized"),
    _item("paprika",     ["paprikas"],                         _Bag,  "pack", "uncategorized"),
    _item("saffron",     ["saffrons", "kesar", "zafran"],      _Bag,  "pack", "uncategorized"),
    _item("vanilla essence", ["vanilla essences", "vanilla extract"], ["bottle", "piece"], "bottle", "uncategorized"),
    # Dried fruits / Nuts (15)
    _item("almond",      ["almonds", "badam"],                 _Bag,  "pack", "uncategorized"),
    _item("cashew",      ["cashews", "kaju"],                  _Bag,  "pack", "uncategorized"),
    _item("walnut",      ["walnuts", "akhrot"],                _Bag,  "pack", "uncategorized"),
    _item("pistachio",   ["pistachios", "pista"],              _Bag,  "pack", "uncategorized"),
    _item("peanut",      ["peanuts", "moongfali", "mungfali"], _Bag,  "pack", "uncategorized"),
    _item("raisin",      ["raisins", "kishmish"],              _Bag,  "pack", "uncategorized"),
    _item("dried apricot", ["dried apricots", "khubani"],      _Bag,  "pack", "uncategorized"),
    _item("hazelnut",    ["hazelnuts"],                        _Bag,  "pack", "uncategorized"),
    _item("macadamia",   ["macadamias"],                       _Bag,  "pack", "uncategorized"),
    _item("pecan",       ["pecans"],                           _Bag,  "pack", "uncategorized"),
    _item("flax seed",   ["flax seeds", "alsi"],               _Bag,  "pack", "uncategorized"),
    _item("chia seed",   ["chia seeds"],                       _Bag,  "pack", "uncategorized"),
    _item("sunflower seed", ["sunflower seeds"],               _Bag,  "pack", "uncategorized"),
    _item("pumpkin seed",["pumpkin seeds"],                    _Bag,  "pack", "uncategorized"),
    _item("sesame",      ["sesames", "til"],                   _Bag,  "pack", "uncategorized"),
    # Lentils / Pulses (10)
    _item("toor dal",    ["toor dals", "arhar dal", "pigeon pea"], _Bag, "kg", "uncategorized"),
    _item("moong dal",   ["moong dals", "green gram"],         _Bag,  "kg",   "uncategorized"),
    _item("chana dal",   ["chana dals", "bengal gram"],        _Bag,  "kg",   "uncategorized"),
    _item("urad dal",    ["urad dals", "black gram"],          _Bag,  "kg",   "uncategorized"),
    _item("masoor dal",  ["masoor dals", "red lentil", "red lentils"], _Bag, "kg", "uncategorized"),
    _item("rajma",       ["rajmas", "kidney bean", "kidney beans"], _Bag, "kg", "uncategorized"),
    _item("chickpea",    ["chickpeas", "chole", "chana", "kabuli chana"], _Bag, "kg", "uncategorized"),
    _item("black eyed pea", ["black eyed peas", "lobia", "rongi"], _Bag, "kg", "uncategorized"),
    _item("soybean",     ["soybeans", "soya bean"],            _Bag,  "kg",   "uncategorized"),
    _item("lentil",      ["lentils", "dal", "daal"],           _Bag,  "kg",   "uncategorized"),
]


# ═══════════════════════════════════════════════════════════════════════
# MASTER CATALOG  — flat list + keyword lookup
# ═══════════════════════════════════════════════════════════════════════

ALL_ITEMS: List[CatalogItem] = (
    DAIRY + FRUITS + MEAT + UTILITIES + BEVERAGES + BAKERY + PANTRY + UNCATEGORIZED
)

# keyword → CatalogItem  (built once at import time)
_KEYWORD_INDEX: Dict[str, CatalogItem] = {}
for _item_entry in ALL_ITEMS:
    for _kw in _item_entry["keywords"]:
        _KEYWORD_INDEX[_kw.lower()] = _item_entry


def lookup_by_keyword(keyword: str) -> Optional[CatalogItem]:
    """Exact O(1) lookup by any known keyword / alias."""
    return _KEYWORD_INDEX.get(keyword.lower())


def get_all_keywords() -> List[str]:
    """Return every keyword in the catalog (for fuzzy matching)."""
    return list(_KEYWORD_INDEX.keys())


def resolve_unit_alias(raw_unit: str) -> Optional[str]:
    """Normalise a user-spoken unit to its canonical form, or None."""
    return UNIT_ALIASES.get(raw_unit.lower().strip())

# ─── Item Relationships for Smart Suggestions ────────────────────────
# Used by the backend to prompt follow-ups when an item is added.
RELATED_ITEMS: Dict[str, List[str]] = {
    "milk": ["cookies", "cereal", "coffee"],
    "bread": ["butter", "jam", "egg"],
    "pasta": ["tomato sauce", "cheese", "garlic"],
    "coffee": ["sugar", "milk", "cookies"],
    "potato": ["onion", "garlic", "tomato"],
    "egg": ["bread", "milk", "bacon"],
    "butter": ["bread", "milk"],
    "cheese": ["bread", "pasta", "wine"],
    "cereal": ["milk"],
}
