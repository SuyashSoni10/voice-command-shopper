import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

const products = [
  { name: 'milk', brand: 'DairyPure', category: 'dairy', price: 3.99 },
  { name: 'bread', brand: 'Wonder', category: 'bakery', price: 2.49 },
  { name: 'eggs', brand: 'Eggland', category: 'dairy', price: 4.99 },
  { name: 'cheese', brand: 'Kraft', category: 'dairy', price: 5.49 },
  { name: 'apple', brand: 'Generic', category: 'produce', price: 1.20 },
  { name: 'banana', brand: 'Chiquita', category: 'produce', price: 0.50 },
  { name: 'water', brand: 'Dasani', category: 'beverages', price: 1.00 },
  { name: 'toothpaste', brand: 'Colgate', category: 'personal_care', price: 3.50 },
  { name: 'chicken', brand: 'Tyson', category: 'meat', price: 7.99 },
  { name: 'rice', brand: 'Uncle Ben', category: 'pantry', price: 2.99 }
];

async function seed() {
  console.log('Inserting mock products...');
  const { error } = await supabase.from('product_catalog').insert(products);
  if (error) console.error('Error seeding:', error);
  else console.log('Successfully seeded!');
}

seed();
