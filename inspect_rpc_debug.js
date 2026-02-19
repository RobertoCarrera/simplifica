
import { createClient } from '@supabase/supabase-js';

// Read from args or env
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY; 

if (!SUPABASE_KEY) {
    console.error('Please provide SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY env var');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testRpc() {
    console.log('Testing get_top_used_products...');
    // We need a valid company_id. From the logs: 30b6c6b9-f622-4857-987d-8b7bb461c893
    const companyId = '30b6c6b9-f622-4857-987d-8b7bb461c893';
    
    const { data, error } = await supabase
        .rpc('get_top_used_products', { target_company_id: companyId, limit_count: 3 });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Success:', data);
    }
}

testRpc();
