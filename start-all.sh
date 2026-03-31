#!/bin/bash
# Arranca los 3 apps en paralelo, cada uno en su propia ventana de terminal
# CRM → http://localhost:4200
# Portal → http://localhost:4201
# Agenda → http://localhost:4202

echo "Iniciando CRM     → http://localhost:4200"
mintty -t "CRM :4200" bash -c "cd /f/simplifica/simplifica-crm && pnpm start; exec bash" &

echo "Iniciando Portal  → http://localhost:4201"
mintty -t "Portal :4201" bash -c "cd /f/simplifica/simplifica-portal-frontend && pnpm start; exec bash" &

echo "Iniciando Agenda  → http://localhost:4202"
mintty -t "Agenda :4202" bash -c "cd /f/simplifica/simplifica-agenda-frontend && pnpm start; exec bash" &

echo ""
echo "Las 3 ventanas están arrancando. Esperá ~30s hasta que Angular compile."
