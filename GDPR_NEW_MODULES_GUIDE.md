# 🛡️ Guía GDPR para Nuevos Módulos en Simplifica

## 📋 **Problemas Identificados en la Estructura Actual**

### 🚨 **CRÍTICO: Duplicación de Tablas de Clientes**
- **`customers`** (antigua) → Sin campos GDPR
- **`clients`** (nueva) → Con campos GDPR completos

**👉 ACCIÓN REQUERIDA:** Decidir qué tabla usar y migrar datos.

### ⚠️ **Políticas RLS Incompletas**
- Algunas tablas GDPR sin políticas
- Políticas existentes no consideran anonimización
- Falta control de acceso por empresa en algunas tablas

---

## 🎯 **Directrices GDPR para Nuevos Módulos**

### **1. Módulo de TICKETS (Urgente)**

#### Problemas actuales:
```sql
-- La tabla tickets puede exponer datos de clientes sin control GDPR
CREATE TABLE public.tickets (
  client_id uuid REFERENCES public.clients(id)  -- ¿clients o customers?
  -- Falta política GDPR para acceso a datos de clientes
);
```

#### Correcciones necesarias:
```sql
-- 1. Asegurar referencia correcta a tabla de clientes
ALTER TABLE public.tickets 
ADD CONSTRAINT tickets_client_gdpr_check
CHECK (
    -- Solo permitir referencias a clientes no anonimizados
    client_id NOT IN (
        SELECT id FROM public.clients WHERE anonymized_at IS NOT NULL
    )
);

-- 2. Política RLS GDPR para tickets
CREATE POLICY "tickets_gdpr_access" 
ON public.tickets
FOR ALL
TO public
USING (
    company_id IN (SELECT company_id FROM user_company_context)
    AND client_id NOT IN (
        -- Excluir tickets de clientes anonimizados
        SELECT id FROM public.clients WHERE anonymized_at IS NOT NULL
    )
);

-- 3. Auditoría automática cuando se accede a datos de cliente vía ticket
CREATE OR REPLACE FUNCTION log_ticket_client_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.gdpr_audit_log (
        user_id, company_id, action_type, table_name, 
        record_id, subject_email, legal_basis, purpose
    )
    SELECT 
        auth.uid(), NEW.company_id, 'read', 'tickets',
        NEW.id, c.email, 'contract', 'Ticket management - client data access'
    FROM public.clients c 
    WHERE c.id = NEW.client_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_ticket_client_access
    AFTER SELECT ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION log_ticket_client_access();
```

### **2. Módulo de FACTURAS (Futuro)**

#### Consideraciones GDPR críticas:
```typescript
// Campos requeridos para compliance
interface Invoice {
  id: string;
  client_id: string;
  
  // GDPR Compliance - OBLIGATORIO
  data_retention_until: Date;        // Obligación legal contable (7 años)
  legal_basis: 'contract' | 'legal_obligation';
  anonymization_eligible: boolean;   // Algunas facturas NO se pueden anonimizar
  gdpr_notes?: string;              // Razón por la que se mantienen datos
}
```

#### Implementación necesaria:
```sql
-- Tabla facturas GDPR-compliant
CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients(id),
    company_id uuid REFERENCES public.companies(id),
    
    -- Campos de factura normales
    invoice_number text NOT NULL,
    amount numeric NOT NULL,
    
    -- GDPR Compliance OBLIGATORIO
    data_retention_until timestamp with time zone NOT NULL DEFAULT (now() + interval '7 years'),
    legal_basis text NOT NULL DEFAULT 'legal_obligation',
    anonymization_eligible boolean DEFAULT false,  -- Facturas generalmente NO
    gdpr_notes text DEFAULT 'Legal obligation - accounting records retention',
    
    created_at timestamp with time zone DEFAULT now()
);

-- Política GDPR para facturas
CREATE POLICY "invoices_gdpr_access" 
ON public.invoices
FOR ALL
TO public
USING (
    company_id IN (SELECT company_id FROM user_company_context)
    AND (
        -- Permitir acceso si no vencido el período de retención
        data_retention_until > now()
        OR 
        -- O si usuario es DPO/Admin (pueden ver todo para auditoría)
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.auth_user_id = auth.uid() 
            AND (u.is_dpo = true OR u.data_access_level = 'admin')
        )
    )
);
```

### **3. Cualquier Módulo con Datos de Cliente**

#### Checklist obligatorio:
- [ ] **¿Referencia a datos de cliente?** → Añadir auditoría GDPR
- [ ] **¿Almacena datos personales?** → Añadir campos de consentimiento
- [ ] **¿Datos sensibles?** → Añadir campos de retención
- [ ] **¿Datos de menores?** → Añadir verificación parental
- [ ] **¿Transferencias a terceros?** → Documentar en processing_activities

#### Template para nuevos módulos:
```sql
-- Template para tabla GDPR-compliant
CREATE TABLE public.nueva_tabla (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients(id),  -- ¡Usar clients, no customers!
    company_id uuid REFERENCES public.companies(id),
    
    -- [TUS CAMPOS ESPECÍFICOS]
    
    -- GDPR Fields (adaptar según necesidad)
    legal_basis text NOT NULL,
    data_retention_until timestamp with time zone,
    anonymization_eligible boolean DEFAULT true,
    gdpr_processing_purpose text,
    
    created_at timestamp with time zone DEFAULT now(),
    
    -- Constraint GDPR
    CONSTRAINT nueva_tabla_no_anonymized_clients 
    CHECK (
        client_id NOT IN (
            SELECT id FROM public.clients WHERE anonymized_at IS NOT NULL
        )
    )
);

-- Política RLS GDPR
CREATE POLICY "nueva_tabla_gdpr_access" 
ON public.nueva_tabla
FOR ALL
TO public
USING (
    company_id IN (SELECT company_id FROM user_company_context)
    AND client_id NOT IN (
        SELECT id FROM public.clients WHERE anonymized_at IS NOT NULL
    )
);

-- Auditoría automática
CREATE OR REPLACE FUNCTION log_nueva_tabla_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.gdpr_audit_log (
        user_id, company_id, action_type, table_name, 
        record_id, subject_email, legal_basis, purpose
    )
    SELECT 
        auth.uid(), NEW.company_id, lower(TG_OP), TG_TABLE_NAME,
        NEW.id, c.email, NEW.legal_basis, NEW.gdpr_processing_purpose
    FROM public.clients c 
    WHERE c.id = NEW.client_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_nueva_tabla_access
    AFTER INSERT OR UPDATE OR DELETE ON public.nueva_tabla
    FOR EACH ROW EXECUTE FUNCTION log_nueva_tabla_access();
```

---

## 🚀 **Acciones Inmediatas Requeridas**

### **PASO 1: Resolver Duplicación de Clientes** ⚡
```bash
# Decidir: ¿Usar customers o clients?
# Recomendación: clients (tiene GDPR completo)

# Si usas clients:
1. Migrar datos de customers → clients
2. Actualizar todas las FK en tickets, devices, etc.
3. Actualizar código Angular para usar clients

# Si usas customers:
1. Añadir todos los campos GDPR a customers
2. Actualizar modelo TypeScript
```

### **PASO 2: Ejecutar Correcciones** 📝
```sql
-- Ejecutar el archivo que creé:
-- database/fix-gdpr-structure.sql
```

### **PASO 3: Actualizar Código Angular** 🔧
```typescript
// Si cambias a clients, actualizar servicios:
// src/app/services/supabase-customers.service.ts
// Cambiar todas las referencias de 'customers' → 'clients'
```

---

## ✅ **Validación de Compliance**

### Para cada nuevo módulo, verificar:
1. **¿Los datos están protegidos?** → RLS policies ✓
2. **¿Se registra el acceso?** → Audit logging ✓  
3. **¿Respeta anonimización?** → Constraints + policies ✓
4. **¿Tiene base legal?** → legal_basis field ✓
5. **¿Periodo de retención?** → data_retention_until ✓

---

## 🔍 **Resumen de Estado Actual**

### ✅ **Bien implementado:**
- Esquema GDPR base
- Servicios TypeScript
- Componente customer con indicadores
- Configuración DPO

### ⚠️ **Necesita corrección urgente:**
- Duplicación customers/clients  
- Políticas RLS incompletas
- Triggers de auditoría faltantes
- Referencias inconsistentes en tickets

### 📋 **Para módulos futuros:**
- Usar template GDPR
- Implementar auditoría automática
- Verificar compliance antes de deploy
