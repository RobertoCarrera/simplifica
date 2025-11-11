#!/bin/bash
# Script para verificar JWT en la consola del navegador

echo "====================================================================================="
echo "VERIFICAR JWT INCLUYE COMPANY_ID"
echo "====================================================================================="
echo ""
echo "1. Abre la consola de tu navegador (F12 → Console)"
echo ""
echo "2. Pega este código y presiona Enter:"
echo ""
cat << 'EOF'
// Obtener el token actual de Supabase
(async () => {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    console.log('🔑 Access Token:', session.access_token);
    console.log('');
    console.log('📋 Decoded JWT:');
    
    // Decodificar el payload (parte central del JWT)
    const payload = JSON.parse(atob(session.access_token.split('.')[1]));
    console.log(payload);
    
    // Verificar company_id
    if (payload.company_id) {
      console.log('');
      console.log('✅ JWT incluye company_id:', payload.company_id);
    } else {
      console.log('');
      console.log('❌ JWT NO incluye company_id');
      console.log('👉 Cierra sesión e inicia sesión de nuevo');
    }
  } else {
    console.log('❌ No hay sesión activa');
  }
})();
EOF
echo ""
echo "3. Deberías ver tu company_id en el output"
echo ""
echo "ALTERNATIVA: Ir a https://jwt.io"
echo "- Copia el access_token de la consola"
echo "- Pégalo en jwt.io"
echo "- Busca 'company_id' en el Decoded payload"
echo ""
echo "====================================================================================="
