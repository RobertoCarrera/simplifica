# 🚀 Despliegue en Producción - Módulo de Facturación

## ⚠️ **IMPORTANTE: Checklist Pre-Despliegue**

**NO desplegar sin completar:**

- [ ] Backup completo de base de datos
- [ ] Backup de código actual
- [ ] Revisión de seguridad
- [ ] Tests completados
- [ ] Documentación GDPR lista
- [ ] DPO informado
- [ ] Equipo formado

---

## 📋 **Fase 1: Preparación (1 día antes)**

### **1.1 Backup de Base de Datos**

```bash
# En Supabase Dashboard → Database → Backups
# O vía CLI:
supabase db dump --db-url "postgresql://..." > backup_pre_facturacion.sql
```

- [ ] Backup guardado en lugar seguro
- [ ] Backup verificado (restaurable)
- [ ] Fecha del backup documentada

### **1.2 Backup de Código**

```bash
git add .
git commit -m "Pre-deployment: Facturación module backup"
git tag v1.0.0-pre-facturacion
git push origin main --tags
```

- [ ] Commit creado
- [ ] Tag creado
- [ ] Push realizado

### **1.3 Crear Branch de Producción**

```bash
git checkout -b production/facturacion
git push origin production/facturacion
```

---

## 📊 **Fase 2: Base de Datos (2 horas)**

### **2.1 Ejecutar en Supabase - DEVELOPMENT FIRST**

⚠️ **NUNCA ejecutar directamente en producción**

```sql
-- 1. Conectar a DEVELOPMENT
-- Supabase Dashboard → Project: simplifica-dev → SQL Editor

-- 2. Ejecutar script completo
-- Copiar todo el contenido de:
-- supabase/migrations/20251015_invoicing_complete_system.sql

-- 3. Verificar que no hay errores
```

- [ ] Script ejecutado en DEV
- [ ] Sin errores en DEV
- [ ] Tablas creadas en DEV
- [ ] Políticas RLS activas en DEV

### **2.2 Verificación en DEV**

```sql
-- Verificar tablas
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'invoice%';

-- Verificar RLS
SELECT tablename, policyname FROM pg_policies 
WHERE tablename LIKE 'invoice%';

-- Verificar funciones
SELECT proname FROM pg_proc 
WHERE proname LIKE '%invoice%';

-- Test de numeración
SELECT * FROM invoice_series LIMIT 5;
```

**Debe mostrar:**
- [ ] 5 tablas (`invoice_series`, `invoices`, `invoice_items`, `invoice_payments`, `invoice_templates`)
- [ ] ~20 políticas RLS
- [ ] 4 funciones
- [ ] Al menos 1 serie por empresa

### **2.3 Ejecutar en PRODUCTION**

⚠️ **Solo si DEV funcionó correctamente**

```sql
-- 1. Conectar a PRODUCTION
-- Supabase Dashboard → Project: simplifica-prod → SQL Editor

-- 2. Ejecutar script completo
-- Copiar todo el contenido de:
-- supabase/migrations/20251015_invoicing_complete_system.sql

-- 3. Verificar inmediatamente
```

- [ ] Script ejecutado en PROD
- [ ] Sin errores en PROD
- [ ] Verificación completa en PROD

---

## 💻 **Fase 3: Código Angular (1 hora)**

### **3.1 Instalar Dependencias**

```bash
cd f:\simplifica
npm install crypto-js qrcode
npm install --save-dev @types/qrcode
```

- [ ] Dependencias instaladas
- [ ] `package.json` actualizado
- [ ] `package-lock.json` actualizado

### **3.2 Corregir Importación**

```typescript
// src/app/services/verifactu.service.ts, línea 3
// CAMBIAR:
import * as CryptoJS from 'crypto-js';

// POR:
import CryptoJS from 'crypto-js';
```

- [ ] Importación corregida
- [ ] Sin errores de TypeScript

### **3.3 Compilar y Verificar**

```bash
npm run build
```

**Verificar que NO hay errores:**
- [ ] Compilación exitosa
- [ ] Sin errores de TypeScript
- [ ] Sin warnings críticos

---

## 🧪 **Fase 4: Testing (2 horas)**

### **4.1 Test Local**

```bash
ng serve
```

**Probar en http://localhost:4200:**

1. **Login**
   - [ ] Login funciona
   - [ ] Usuario tiene `company_id`

2. **Console sin errores**
   - [ ] No hay errores en consola
   - [ ] RLS policies funcionan

3. **Test de servicio** (en console del navegador):

```javascript
// Abrir DevTools → Console
// Inyectar servicio y probar

// Test 1: Obtener series
invoiceService.getInvoiceSeries().subscribe(
  data => console.log('✅ Series:', data),
  err => console.error('❌ Error:', err)
);

// Test 2: Crear factura de prueba
const dto = {
  client_id: 'ID-CLIENTE-REAL',
  items: [{
    description: 'Test',
    quantity: 1,
    unit_price: 100,
    tax_rate: 21
  }]
};

invoiceService.createInvoice(dto).subscribe(
  inv => console.log('✅ Factura:', inv.full_invoice_number),
  err => console.error('❌ Error:', err)
);
```

- [ ] Series se obtienen
- [ ] Factura se crea
- [ ] Número se asigna (`2025-A-00001`)
- [ ] Total correcto (121.00)

### **4.2 Test en Staging**

```bash
# Desplegar a staging (Vercel preview)
git push origin production/facturacion

# Vercel creará preview automáticamente
```

**Probar en URL de preview:**
- [ ] Todo funciona igual que local
- [ ] RLS policies funcionan
- [ ] No hay errores de CORS

---

## 🔒 **Fase 5: Seguridad (30 minutos)**

### **5.1 Verificar RLS Policies**

```sql
-- En PRODUCTION
-- Verificar que RLS está habilitado
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'invoice%';

-- Debe mostrar rowsecurity = true para todas
```

- [ ] RLS habilitado en todas las tablas
- [ ] Políticas activas

### **5.2 Test de Aislamiento**

```sql
-- Con usuario de empresa A
SELECT * FROM invoices;
-- Solo debe ver facturas de empresa A

-- Con usuario de empresa B
SELECT * FROM invoices;
-- Solo debe ver facturas de empresa B
```

- [ ] Aislamiento multi-tenant funciona
- [ ] No hay acceso cruzado

### **5.3 Auditoría de Accesos**

```sql
-- Habilitar log de RLS (opcional)
ALTER TABLE invoices SET (log_statement = 'all');
```

---

## 📜 **Fase 6: GDPR (1 hora)**

### **6.1 Actualizar RAT**

**Registro de Actividades de Tratamiento:**

Añadir entrada:

```
TRATAMIENTO: FACTURACIÓN Y CONTABILIDAD
Responsable: [Nombre empresa]
Finalidad: Emisión y gestión de facturas
Base Legal: Obligación legal (Art. 6.1.c GDPR)
Categorías: Identificativos, Económicos, Transaccionales
Destinatarios: AEAT, Bancos
Plazo: 7 años + anonimización
Medidas: Cifrado AES-256, RLS, Auditoría
```

- [ ] RAT actualizado
- [ ] DPO informado
- [ ] Documento firmado

### **6.2 Cláusula Informativa**

**Actualizar contratos y facturas:**

```
PROTECCIÓN DE DATOS
Responsable: [Empresa] - NIF [XXX]
Finalidad: Facturación conforme normativa fiscal
Base legal: Obligación legal
Destinatarios: AEAT, entidades financieras
Conservación: 7 años + anonimización
Derechos: Acceso, rectificación, portabilidad (NO supresión)
Contacto: dpo@empresa.com
```

- [ ] Cláusula añadida a contratos
- [ ] Cláusula en plantilla de factura PDF
- [ ] Web actualizada (Política de Privacidad)

### **6.3 Formación del Equipo**

**Sesión de 30 minutos:**

Puntos clave:
1. Facturas NO se borran (obligación legal)
2. Sí se anonimizan tras 7 años
3. Responder solicitudes en 30 días
4. No enviar facturas a terceros sin consentimiento
5. Auditar todos los accesos

- [ ] Equipo formado
- [ ] Documentación entregada
- [ ] Dudas resueltas

---

## 🚀 **Fase 7: Despliegue Final (30 minutos)**

### **7.1 Merge a Main**

```bash
git checkout main
git merge production/facturacion
git push origin main
```

- [ ] Merge realizado
- [ ] Push exitoso
- [ ] CI/CD ejecutado

### **7.2 Despliegue Vercel**

**Automático vía Git push, pero verificar:**

```bash
# Ver logs de despliegue
vercel logs
```

- [ ] Build exitoso
- [ ] Deploy completado
- [ ] URL de producción activa

### **7.3 Verificación Post-Despliegue**

**En https://simplifica.digitalizamostupyme.es:**

1. **Login**
   - [ ] Login funciona
   - [ ] Sin errores

2. **Test de facturación**
   - [ ] Crear factura de prueba
   - [ ] Ver listado (si hay UI)
   - [ ] Verificar numeración

3. **Console limpia**
   - [ ] Sin errores en consola
   - [ ] RLS funcionando

---

## 📊 **Fase 8: Monitorización (24 horas)**

### **8.1 Logs de Supabase**

```sql
-- Monitorizar logs
-- Supabase Dashboard → Logs → Postgres Logs
```

**Buscar errores:**
- `ERROR`
- `FATAL`
- `permission denied`

- [ ] Sin errores críticos
- [ ] RLS funcionando correctamente

### **8.2 Logs de Vercel**

```bash
vercel logs --follow
```

**Monitorizar:**
- Errores 500
- Errores de API
- Timeouts

- [ ] Sin errores
- [ ] Performance normal

### **8.3 Alertas**

**Configurar alertas en Supabase:**

Dashboard → Settings → Alerts:
- [ ] CPU > 80%
- [ ] Memory > 80%
- [ ] Query time > 1s
- [ ] Failed RLS checks

---

## 🔄 **Fase 9: Rollback (Si hay problemas)**

### **9.1 Rollback de Código**

```bash
# Volver al commit anterior
git revert HEAD
git push origin main

# O volver al tag
git reset --hard v1.0.0-pre-facturacion
git push origin main --force
```

### **9.2 Rollback de Base de Datos**

```sql
-- Eliminar tablas creadas
DROP TABLE IF EXISTS invoice_payments CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS invoice_series CASCADE;
DROP TABLE IF EXISTS invoice_templates CASCADE;

-- Restaurar backup
-- Supabase Dashboard → Database → Restore from backup
```

⚠️ **SOLO si es absolutamente necesario**

---

## ✅ **Fase 10: Comunicación (Post-Despliegue)**

### **10.1 Comunicado Interno**

```
ASUNTO: ✅ Módulo de Facturación Desplegado

Equipo,

El módulo de facturación ha sido desplegado exitosamente en producción.

Funcionalidades disponibles:
- ✅ Emisión de facturas
- ✅ Gestión de pagos
- ✅ Numeración automática
- ✅ GDPR conforme
- ✅ Veri*Factu preparado (80%)

Documentación:
- Guía de uso: [LINK]
- GDPR: FACTURACION_GDPR_COMPLIANCE.md
- Soporte: dpo@empresa.com

¡Gracias por vuestra colaboración!

[Firma]
```

### **10.2 Comunicado a Clientes (Opcional)**

```
ASUNTO: Nueva funcionalidad: Facturación digital

Estimado cliente,

Nos complace informarle que hemos mejorado nuestro sistema de facturación:

✅ Facturas digitales con sello de tiempo
✅ Descarga instantánea en PDF y XML
✅ Historial completo de pagos
✅ Cumplimiento GDPR y normativa fiscal

Puede acceder a sus facturas desde su área de cliente.

Atentamente,
[Empresa]
```

---

## 📋 **Checklist Final**

### **Pre-Despliegue**
- [ ] Backup BD realizado
- [ ] Backup código realizado
- [ ] Tests completados
- [ ] Documentación GDPR lista

### **Despliegue**
- [ ] Script SQL en DEV ✅
- [ ] Script SQL en PROD ✅
- [ ] Código desplegado ✅
- [ ] Tests post-despliegue ✅

### **Post-Despliegue**
- [ ] Monitorización activa (24h)
- [ ] Sin errores críticos
- [ ] RAT actualizado
- [ ] Equipo formado
- [ ] Comunicados enviados

---

## 🎯 **Métricas de Éxito**

**Día 1:**
- [ ] 0 errores críticos
- [ ] RLS funcionando 100%
- [ ] Al menos 1 factura creada

**Semana 1:**
- [ ] 10+ facturas emitidas
- [ ] 0 violaciones GDPR
- [ ] Equipo formado

**Mes 1:**
- [ ] 100+ facturas emitidas
- [ ] Analytics funcionando
- [ ] Clientes satisfechos

---

## 🚨 **Plan de Contingencia**

### **Problema:** RLS no funciona
**Solución:**
```sql
-- Verificar función
SELECT * FROM get_user_company_id();

-- Recrear si es necesario
-- (ver script SQL)
```

### **Problema:** Numeración duplicada
**Solución:**
```sql
-- Verificar next_number
SELECT * FROM invoice_series;

-- Ajustar si es necesario
UPDATE invoice_series SET next_number = (
  SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1
  FROM invoices WHERE series_id = invoice_series.id
);
```

### **Problema:** Errores de TypeScript
**Solución:**
```bash
# Limpiar caché
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📞 **Contactos de Emergencia**

**Equipo Técnico:**
- Developer: [EMAIL]
- DBA: [EMAIL]
- DevOps: [EMAIL]

**Soporte:**
- Supabase: support@supabase.io
- Vercel: support@vercel.com

**Legal:**
- DPO: dpo@empresa.com
- Asesor GDPR: [EMAIL]

---

## ✅ **Confirmación de Despliegue**

**Firma de aprobación:**

```
Fecha: ___/___/2025
Responsable: _____________________
DPO: _____________________
CTO/Tech Lead: _____________________

✅ Despliegue autorizado
✅ Backups verificados
✅ Documentación completa
✅ Equipo formado
```

---

**¡Listo para desplegar!** 🚀

**Tiempo estimado total:** 8 horas (1 día de trabajo)

**Riesgo:** 🟢 BAJO (con checklist completado)

---

**Última revisión:** 15 de octubre de 2025  
**Versión:** 1.0.0  
**Estado:** ✅ Aprobado para producción

