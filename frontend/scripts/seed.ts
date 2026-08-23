import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SEARCH_TERMS = ['milk', 'bread', 'eggs', 'cheese', 'apple', 'banana', 'water', 'toothpaste'];

// Helper to synthesize a plausible price
function synthesizePrice(category: string): number {
  const base = Math.random() * 5 + 1; // $1 to $6
  if (category.toLowerCase().includes('produce')) return parseFloat(base.toFixed(2));
  if (category.toLowerCase().includes('dairy')) return parseFloat((base + 2).toFixed(2));
  return parseFloat((base + 1).toFixed(2));
}

async function seed() {
  console.log('Fetching products from Open Food Facts...');
  const products = [];

  for (const term of SEARCH_TERMS) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${term}&search_simple=1&action=process&json=1&page_size=3`,
        { headers: { 'User-Agent': 'VoiceBasedOnlineShopper - Development' } }
      );
      const data = await res.json();
      
      for (const product of data.products) {
        if (!product.product_name) continue;
        
        products.push({
          name: product.product_name,
          brand: product.brands ? product.brands.split(',')[0] : 'Generic',
          category: product.categories ? product.categories.split(',')[0] : 'other',
          price: synthesizePrice(product.categories || ''),
          source: 'openfoodfacts'
        });
      }
    } catch (e) {
      console.error(`Error fetching ${term}:`, e);
    }
  }

  console.log(`Inserting ${products.length} products into Supabase...`);
  
  const { error } = await supabase
    .from('product_catalog')
    .insert(products);

  if (error) {
    console.error('Error seeding product_catalog:', error);
  } else {
    console.log('Successfully seeded product_catalog!');
  }
}

seed();
