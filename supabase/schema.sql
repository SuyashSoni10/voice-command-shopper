-- Create shopping_list_items table
CREATE TABLE shopping_list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    purchased_at TIMESTAMPTZ
);

-- Create purchase_history table
CREATE TABLE purchase_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    item_name TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create product_catalog table
CREATE TABLE product_catalog (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    price NUMERIC NOT NULL,
    source TEXT DEFAULT 'openfoodfacts'
);

-- Enable RLS
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shopping_list_items
CREATE POLICY "Users can view their own items" ON shopping_list_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own items" ON shopping_list_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own items" ON shopping_list_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own items" ON shopping_list_items FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for purchase_history
CREATE POLICY "Users can view their own purchase history" ON purchase_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own purchase history" ON purchase_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for product_catalog
CREATE POLICY "Anyone can view products" ON product_catalog FOR SELECT USING (true);

-- Enable Realtime for shopping_list_items
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_items;
