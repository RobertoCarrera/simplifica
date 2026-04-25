#!/bin/bash
# Arranca los 3 apps en paralelo, cada uno en su propia ventana de terminal
# CRM → http://localhost:4200
# Portal → http://localhost:4201
# Agenda → http://localhost:4202

# Supabase: liberar puerto 54322 si lo tiene simplifica-copilot
echo "Parando simplifica-copilot (libera puerto 54322)..."
supabase stop --project-id simplifica-copilot --no-backup 2>/dev/null || true

echo "Arrancando Supabase local..."
supabase start
if [ $? -ne 0 ]; then
  echo "❌ Supabase no pudo arrancar. Revisá los logs arriba."
  exit 1
fi

echo "Iniciando Edge Functions → http://localhost:8000"
mintty -t "Supabase Functions :8000" bash -c "cd /f/simplifica && supabase functions serve; exec bash" &

# Agenda: generar environments antes de arrancar (lee .env.local)
echo "Generando environments de Agenda..."
(cd /f/simplifica/simplifica-agenda-frontend && node scripts/generate-environments.mjs)

echo ""
echo "Iniciando CRM     → http://localhost:4200"
mintty -t "CRM :4200" bash -c "cd /f/simplifica/simplifica-crm && pnpm start; exec bash" &

echo "Iniciando Portal  → http://localhost:4201"
mintty -t "Portal :4201" bash -c "cd /f/simplifica/simplifica-portal-frontend && pnpm start; exec bash" &

echo "Iniciando Agenda  → http://localhost:4202"
mintty -t "Agenda :4202" bash -c "cd /f/simplifica/simplifica-agenda-frontend && pnpm start; exec bash" &

echo ""
echo "Las 4 ventanas están arrancando."
echo "  Edge Functions: ~5s  |  Angular apps: ~30s"
