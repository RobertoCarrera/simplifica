# Script de Optimización Pre-Producción
# Clientes, Tickets y Servicios - Cleanup v1.0

## 🎯 PLAN DE OPTIMIZACIÓN

### 📋 **Componentes Detectados:**

#### ✅ **Componentes Principales (Mantener):**
- `supabase-customers` - Versión moderna de clientes
- `supabase-tickets` - Versión moderna de tickets  
- `supabase-services` - Versión moderna de servicios

#### ❌ **Componentes Obsoletos (Eliminar):**
- `clients` - Versión antigua básica de clientes
- `tickets` - Versión antigua básica de tickets
- `customer-form` - Integrado en supabase-customers
- Posibles duplicados en rutas

### 🔧 **Optimizaciones Detectadas:**

#### **1. Console.logs en Producción:**
- `supabase-customers`: 8 console.log
- `supabase-tickets`: 20+ console.log
- `supabase-services`: 2 console.log

#### **2. Rutas Duplicadas:**
- `/tickets-old` → Eliminar
- Rutas duplicadas en app.routes.ts

#### **3. Hardcoded Values:**
- Verificar URLs hardcodeadas
- Verificar IDs de empresa hardcodeados
- Verificar estilos inline

#### **4. Componentes Duplicados:**
- `ClientsComponent` vs `SupabaseCustomersComponent`
- `TicketsComponent` vs `SupabaseTicketsComponent`

### 📝 **Pasos de Ejecución:**

1. **Eliminar console.logs de producción**
2. **Eliminar componentes obsoletos**
3. **Limpiar rutas duplicadas**
4. **Optimizar imports no utilizados**
5. **Verificar hardcoded values**
6. **Optimizar estilos CSS duplicados**

### 🚀 **Estado Actual:**
- ✅ Base de datos optimizada y limpia
- 🔄 Frontend pendiente de optimización
- 📋 Componentes principales identificados
