export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            product_catalog: {
                Row: {
                    id: string
                    name: string
                    brand: string | null
                    model: string | null
                    category: string | null
                    sku: string | null
                    specs: Json | null
                    compatibility: Json | null
                    company_id: string | null
                    source: string | null
                    image_url: string | null
                    created_at: string | null
                    updated_at: string | null
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    brand?: string | null
                    model?: string | null
                    category?: string | null
                    sku?: string | null
                    specs?: Json | null
                    compatibility?: Json | null
                    company_id?: string | null
                    source?: string | null
                    image_url?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    brand?: string | null
                    model?: string | null
                    category?: string | null
                    sku?: string | null
                    specs?: Json | null
                    compatibility?: Json | null
                    company_id?: string | null
                    source?: string | null
                    image_url?: string | null
                    created_at?: string | null
                    updated_at?: string | null
                    deleted_at?: string | null
                }
            }
            products: {
                Row: {
                    id: string
                    name: string
                    brand: string | null
                    model: string | null
                    description: string | null
                    price: number | null
                    stock_quantity: number | null
                    created_at: string | null
                    updated_at: string | null
                    deleted_at: string | null
                    company_id: string
                    brand_id: string | null
                    category_id: string | null
                    catalog_product_id: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    brand?: string | null
                    model?: string | null
                    description?: string | null
                    price?: number | null
                    stock_quantity?: number | null
                    created_at?: string | null
                    updated_at?: string | null
                    deleted_at?: string | null
                    company_id: string
                    brand_id?: string | null
                    category_id?: string | null
                    catalog_product_id?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    brand?: string | null
                    model?: string | null
                    description?: string | null
                    price?: number | null
                    stock_quantity?: number | null
                    created_at?: string | null
                    updated_at?: string | null
                    deleted_at?: string | null
                    company_id: string
                    brand_id?: string | null
                    category_id?: string | null
                    catalog_product_id?: string | null
                }
            }
            ticket_products: {
                Row: {
                    id: string
                    ticket_id: string
                    product_id: string | null
                    quantity: number
                    price_per_unit: number
                    total_price: number
                    company_id: string | null
                    created_at: string
                    updated_at: string
                    catalog_product_id: string | null
                }
                Insert: {
                    id?: string
                    ticket_id: string
                    product_id?: string | null
                    quantity: number
                    price_per_unit: number
                    total_price: number
                    company_id?: string | null
                    created_at?: string
                    updated_at?: string
                    catalog_product_id?: string | null
                }
                Update: {
                    id?: string
                    ticket_id?: string
                    product_id?: string | null
                    quantity?: number
                    price_per_unit?: number
                    total_price?: number
                    company_id?: string | null
                    created_at?: string
                    updated_at?: string
                    catalog_product_id?: string | null
                }
            }
            // ... other tables (keeping key ones for brevity if file is not overwritten but merged, 
            // but 'write_to_file' overwrites, so I should ideally get the full content or just patch. 
            // Since I don't have the full original file content in memory to reproduce perfectly 
            // without potentially breaking other things, I will skip overwriting the entire `supabase.ts` 
            // and instead focus on updating the service to use `any` or the partial types I define there 
            // if I can't easily merge. 
            // For this environment, usually I should modify the actual file. 
            // Let me READ the actual global types file first if it exists, or deciding where to put these types.)
        }
    }
}
