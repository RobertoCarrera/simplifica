export interface Product {
    id: string;
    name: string;
    // Legacy text fields (for backward compatibility, will be deprecated)
    category: string | null;
    brand: string | null;
    // New normalized fields
    category_id: string | null;
    brand_id: string | null;
    catalog_product_id: string | null;
    model: string | null;
    description: string | null;
    price: number; // store numeric for UI; service will normalize from string if needed
    stock_quantity: number;
    created_at: string;
    updated_at?: string | null;
    deleted_at?: string | null;
    company_id: string;
}