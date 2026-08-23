export const substitutionMap: Record<string, string[]> = {
  'milk': ['almond milk', 'oat milk', 'soy milk'],
  'sugar': ['honey', 'stevia', 'maple syrup'],
  'butter': ['margarine', 'olive oil', 'coconut oil'],
  'flour': ['almond flour', 'coconut flour', 'gluten-free blend'],
  'bread': ['gluten-free bread', 'tortillas', 'lettuce wrap'],
  'rice': ['quinoa', 'cauliflower rice', 'couscous'],
};

export const seasonalCalendar: Record<number, string[]> = {
  0: ['citrus', 'kale', 'brussels sprouts', 'sweet potatoes'], // Jan
  1: ['citrus', 'broccoli', 'cauliflower', 'cabbage'], // Feb
  2: ['asparagus', 'spinach', 'peas', 'radishes'], // Mar
  3: ['artichokes', 'asparagus', 'spring onions', 'rhubarb'], // Apr
  4: ['strawberries', 'cherries', 'apricots', 'zucchini'], // May
  5: ['blueberries', 'peaches', 'watermelon', 'corn'], // Jun
  6: ['tomatoes', 'bell peppers', 'cucumbers', 'melons'], // Jul
  7: ['eggplant', 'figs', 'grapes', 'summer squash'], // Aug
  8: ['apples', 'pears', 'pumpkins', 'squash'], // Sep
  9: ['cranberries', 'apples', 'pomegranates', 'sweet potatoes'], // Oct
  10: ['brussels sprouts', 'cranberries', 'turnips', 'winter squash'], // Nov
  11: ['citrus', 'kale', 'leeks', 'parsnips'], // Dec
};
