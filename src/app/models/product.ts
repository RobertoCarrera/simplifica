export interface Product {
    id: string;
    name: string;
    category: string | null;
    brand: string | null;
    model: string | null;
    description: string | null;
    price: number; // store numeric for UI; service will normalize from string if needed
    stock_quantity: number;
    created_at: string;
    updated_at?: string | null;
    deleted_at?: string | null;
    company_id: string;
}