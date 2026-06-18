# Demo de importador de notas clínicas — Guía de uso

> **Estado actual (2026-06-18)**: la demo YA ESTÁ MONTADA en la DB de producción.
> No hace falta correr setup. Solo tenés que loguearte y abrir el wizard.
> Si querés tirarla abajo, corré el teardown (abajo).

## Qué hay ahora mismo en la DB

- **1 company demo**: `DEMO_Clinical_Notes_2026-06-18_DO_NOT_USE`
  (id: `f83d1474-f3b9-43b1-9598-b14af3ebbc18`)
- **3 clientes sintéticos** dentro de esa company, todos con
  `health_data_consent = true`:
  - Ana Demo García Demo `<ana.demo@demo.invalid>`
  - Luis Demo Martín Demo `<luis.demo@demo.invalid>`
  - Marta Demo López Demo `<marta.demo@demo.invalid>`
- **3 notas clínicas demo** ya insertadas (cifradas con
  `pgp_sym_encrypt`), una por cliente. Las podés ver entrando como
  Roberto y navegando al módulo de historial clínico de la company demo.
- **Roberto** (`roberto@simplificacrm.es`) es **owner** activo de la
  company demo, así que tiene acceso total desde el wizard.

## Cómo mostrárselo a la clienta (5 minutos)

1. **Logueate como Roberto** en el navegador
   (`https://crm.vercel.app` o donde lo tengas deployado).
2. En el selector de company, elegí **"DEMO_Clinical_Notes_..."**.
3. Andá a **Configuración → Importar datos → Asistente de notas
   clínicas**.
4. Subí este CSV (o usá el que te paso en
   `C:/Users/puchu/AppData/Local/Temp/opencode/demo_clinical_notes.csv`):

   ```csv
   first_name,surname,patient_id,episode_id,sequence,date,title,value
   Ana,García,PAT-DEMO-001,EP-DEMO-001,1,2026-06-10,Control mensual,Paciente evoluciona favorablemente. Dolor en escala EVA 2/10. Continuar plan establecido.
   Luis,Martín,PAT-DEMO-002,EP-DEMO-002,1,2026-06-12,Seguimiento,Revisión post-operatoria. ROM completo. Alta médica recomendada con plan de mantenimiento.
   Marta,López,PAT-DEMO-003,EP-DEMO-003,2,2026-06-14,Segunda sesión,Mejoría subjetiva del 40%. Reducción de frecuencia de cefaleas. Continuar tratamiento.
   ```

5. El wizard va a:
   - Resolver 3/3 clientes automáticamente (auto-matched por nombre).
   - Mostrar preview: 3 notas a importar, 0 con error.
   - Ofrecer botón "Importar".
6. Click en "Importar". El RPC cifra y guarda. UI muestra
   "3 importadas correctamente".
7. Navegá a la ficha de Ana/Luis/Marta → Historial clínico → ahí
   están las 4 notas (la demo que dejé pre-insertada + la que acabás
   de importar).

> **Cuidado**: NO importes un CSV con datos de pacientes REALES contra
> esta company demo. Los 532 clientes reales tienen
> `health_data_consent = false` y el sistema va a rechazarlos
> correctamente, pero podrías meterlos a la company demo por error
> y arruinar la demo. Mantené la company demo **aislada**.

## Cómo limpiar la demo (teardown)

Cuando la clienta ya la vio, corré esto en
`simplifica_execute_sql` (o el MCP que uses):

```sql
-- Pegar el contenido de clinical_demo_teardown.sql
```

El script:
- Borra 3 notas clínicas demo.
- Borra 3 clientes sintéticos.
- Borra 1 row de `company_modules`.
- Borra 1 row de `company_members`.
- Borra la company demo.
- Verifica que el estado post-teardown coincide con el baseline
  (914 clientes totales, 532 vivos, 5 companies, 0 notas).

**Es idempotente** — correrlo 2 veces no rompe nada.

## Cómo volver a montar la demo (si la limpiaste y querés repetir)

Pegá el contenido de `clinical_demo_setup.sql` en
`simplifica_execute_sql`. El script es idempotente (re-corre limpio).

## Backups y rollback

### Tags de git creados (en cada repo)

- `F:/simplifica` → tag `backup-pre-clinical-demo-2026-06-18`
- `F:/simplifica/simplifica-crm` → tag `backup-pre-clinical-demo-crm-2026-06-18`
- `F:/simplifica/simplifica-portal-frontend` → tag `backup-pre-clinical-demo-portal-2026-06-18`

Para volver atrás: `git reset --hard backup-pre-clinical-demo-crm-2026-06-18` en crm (igual en los otros).

### Baseline de la DB (estado pre-demo)

- 914 clientes totales, 532 vivos
- 5 companies
- 0 notas clínicas
- 0 booking notes

El teardown verifica que el estado post-limpieza coincide con este baseline.

## Archivos de referencia

- `clinical_demo_setup.sql` — script de setup
- `clinical_demo_teardown.sql` — script de teardown
- `demo_clinical_notes.csv` — CSV de ejemplo
- `GUIA_DEMO.md` — este archivo
- (Próximamente) `marketing_consent_audit.md` — auditoría del componente Marketing

## Bug encontrado durante el setup (no relacionado a la demo)

El trigger `trg_sync_client_consent_cache` en `gdpr_consent_records`
está roto: hace un CASE sobre `clients.consent_status` (que es enum
`public.consent_status`) sin cast explícito. Cualquier INSERT en
`gdpr_consent_records` falla con:

```
column "consent_status" is of type public.consent_status
but expression is of type text
```

**Impacto**: ningún consentimiento se puede registrar en el sistema
vía la tabla canónica. Esto **rompe el flujo de marketing de
consentimientos** que la clienta quiere. Hay que arreglarlo antes
de enviar emails masivos.

**Fix**: agregar cast `(CASE ... END)::public.consent_status` en la
función del trigger. Está pendiente para la próxima sesión.
