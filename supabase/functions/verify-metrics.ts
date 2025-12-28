
import { createClient } from "@supabase/supabase-js";
import 'dotenv/config'; // In case you need .env, but env vars are likely passed via shell or hardcoded for this quick script. 
// However, since we are using npx tsx, we might not have dotenv configured. 
// Let's assume the user has set the env vars or we can read them if they are in .env file in root.
// For simplicity in this environment, let's use process.env.

const SUPABASE_URL = process.env['SUPABASE_URL'] || "";
const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("Please run with: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx ...");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkKpis() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    console.log(`Checking KPIs for range: ${start} to ${end}`);

    console.log("\n--- Refreshing Analytics Views ---");
    const { error: refreshErr } = await supabase.rpc('f_refresh_analytics_views');
    if (refreshErr) console.error("Error refreshing views:", refreshErr);
    else console.log("Refresh successful.");

    console.log("\n--- Invoice KPIs (RPC) ---");
    const { data: inv, error: invErr } = await supabase.rpc('f_invoice_kpis_monthly', { p_start: start, p_end: end });
    if (invErr) console.error("Error:", invErr);
    else console.table(inv);

    console.log("\n--- Quote KPIs (RPC) ---");
    const { data: qt, error: qtErr } = await supabase.rpc('f_quote_kpis_monthly', { p_start: start, p_end: end });
    if (qtErr) console.error("Error:", qtErr);
    else console.table(qt);

    console.log("\n--- Ticket KPIs (RPC - might be empty if no user context) ---");
    const { data: tk, error: tkErr } = await supabase.rpc('f_ticket_kpis_monthly', { p_start: start, p_end: end });
    if (tkErr) console.error("Error:", tkErr);
    else console.table(tk);

    console.log("\n--- Ticket Current Status (RPC - might be empty if no user context) ---");
    const { data: st, error: stErr } = await supabase.rpc('f_ticket_current_status');
    if (stErr) console.error("Error:", stErr);
    else console.table(st);

    console.log("\n--- Table Counts (Diagnostics) ---");
    const { count: invCount, error: invCountErr } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    console.log(`Invoices Total: ${invCount} (Error: ${invCountErr?.message || 'None'})`);

    const { count: qtCount, error: qtCountErr } = await supabase.from('quotes').select('*', { count: 'exact', head: true });
    console.log(`Quotes Total: ${qtCount} (Error: ${qtCountErr?.message || 'None'})`);

    const { count: tkCount, error: tkCountErr } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
    console.log(`Tickets Total: ${tkCount} (Error: ${tkCountErr?.message || 'None'})`);

    if (tkCount && tkCount > 0) {
        console.log("\n--- Sample Tickets Data (with company_id) ---");
        // Select all to ensure we don't miss columns, limit to 2 to avoid clutter
        const { data: tickets, error: tkError } = await supabase.from('tickets').select('*').limit(2);
        if (tkError) console.error("Error fetching tickets:", tkError);
        else console.table(tickets);

        console.log("\n--- Checking Materialized View Direct Access (should show data if refreshed) ---");
        // Switch to analytics schema and list ALL data (limit 10) to see if ANY company has data
        const { data: mvData, error: mvError } = await supabase.schema('analytics').from('mv_ticket_kpis_monthly').select('*').limit(10);
        if (mvError) console.log("MV Error:", mvError.message);
        else {
            console.log(`MV Row Count (Limit 10): ${mvData?.length}`);
            console.table(mvData);
        }
    }
}

checkKpis();
