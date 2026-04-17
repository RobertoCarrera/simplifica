const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://txmujatjvjpwofkdihih.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!supabaseKey) {
    console.log('No service role key found in .env');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.log('listUsers error:', listError.message);
    return;
  }

  const roberto = usersData?.users?.find(u => u.email === 'roberto@simplificacrm.es');
  if (!roberto) {
    console.log('Roberto not found in auth.users');
    return;
  }
  console.log('Roberto auth UID:', roberto.id);

  const { data: appUser, error: appError } = await supabase
    .from('app_users')
    .select('id, email, company_id, role')
    .eq('auth_user_id', roberto.id)
    .single();

  console.log('app_users row:', JSON.stringify(appUser, null, 2));
  if (appError) console.log('app_users error:', appError);

  if (appUser?.company_id) {
    const { data: company, error: coError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', appUser.company_id)
      .single();
    console.log('Company:', JSON.stringify(company, null, 2));
    if (coError) console.log('company error:', coError);
  } else {
    console.log('WARNING: app_user has NO company_id or it is NULL');
  }
}

main().catch(console.error);
