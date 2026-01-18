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
                    ean?: string | null
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
                    ean?: string | null
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
                    min_stock_level: number | null
                    barcode: string | null
                    location: string | null
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
                    min_stock_level?: number | null
                    barcode?: string | null
                    location?: string | null
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
                    min_stock_level?: number | null
                    barcode?: string | null
                    location?: string | null
                }
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
        suppliers: {
            Row: {
                id: string
                company_id: string
                name: string
                email: string | null
                phone: string | null
                website: string | null
                address: string | null
                tax_id: string | null
                created_at: string | null
                updated_at: string | null
                deleted_at: string | null
            }
            Insert: {
                id?: string
                company_id: string
                name: string
                email?: string | null
                phone?: string | null
                website?: string | null
                address?: string | null
                tax_id?: string | null
                created_at?: string | null
                updated_at?: string | null
                deleted_at?: string | null
            }
            Update: {
                id?: string
                company_id?: string
                name?: string
                email?: string | null
                phone?: string | null
                website?: string | null
                address?: string | null
                tax_id?: string | null
                created_at?: string | null
                updated_at?: string | null
                deleted_at?: string | null
            }
        }
        supplier_products: {
            Row: {
                id: string
                company_id: string
                supplier_id: string
                catalog_product_id: string
                supplier_sku: string | null
                price: number
                currency: string | null
                url: string | null
                last_checked_at: string | null
                created_at: string | null
                updated_at: string | null
            }
            Insert: {
                id?: string
                company_id: string
                supplier_id: string
                catalog_product_id: string
                supplier_sku?: string | null
                price?: number
                currency?: string | null
                url?: string | null
                last_checked_at?: string | null
                created_at?: string | null
                updated_at?: string | null
            }
            Update: {
                id?: string
                company_id?: string
                supplier_id?: string
                catalog_product_id?: string
                supplier_sku?: string | null
                price?: number
                currency?: string | null
                url?: string | null
                last_checked_at?: string | null
                created_at?: string | null
                updated_at?: string | null
            }
        }
        stock_movements: {
            Row: {
                id: string
                company_id: string
                product_id: string
                quantity_change: number
                movement_type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'initial'
                reference_id: string | null
                user_id: string | null
                notes: string | null
                created_at: string | null
            }
            Insert: {
                id?: string
                company_id: string
                product_id: string
                quantity_change: number
                movement_type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'initial'
                reference_id?: string | null
                user_id?: string | null
                notes?: string | null
                created_at?: string | null
            }
            Update: {
                id?: string
                company_id?: string
                product_id?: string
                quantity_change?: number
                movement_type?: 'purchase' | 'sale' | 'adjustment' | 'return' | 'initial'
                reference_id?: string | null
                user_id?: string | null
                notes?: string | null
                created_at?: string | null
            }
        }
    }
}
}
