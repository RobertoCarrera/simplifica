# Guía de Implementación: Supabase Realtime en Angular

Esta guía documenta el patrón establecido para implementar actualizaciones en tiempo real usando Supabase Realtime con Angular signals.

## Requisitos Previos

### 1. Habilitar Realtime en la tabla (Supabase Dashboard)

Ejecutar en el SQL Editor de Supabase:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE nombre_tabla;
```

O desde el Dashboard:
- Database → Tables → Seleccionar tabla → Click en "Realtime" toggle

### 2. Configuración del Cliente Supabase

En `supabase-client.service.ts`, asegurarse de incluir la configuración de realtime:

```typescript
this.client = createClient(url, anonKey, {
  auth: { ... },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  // ... resto de config
});
```

## Patrón de Implementación

### 1. Crear método de suscripción en el servicio

```typescript
import { RealtimeChannel } from '@supabase/supabase-js';

// En el servicio (ej: supabase-quotes.service.ts)
subscribeToChanges(callback: (payload: any) => void): RealtimeChannel | null {
  const companyId = this.authService.companyId();
  if (!companyId) return null;

  // Nombre único con timestamp para evitar conflictos
  const channelName = `tabla-realtime-${companyId}-${Date.now()}`;
  const client = this.supabaseClient.instance;
  
  const channel = client.channel(channelName, {
    config: {
      broadcast: { self: true },
      presence: { key: '' }
    }
  });

  channel.on(
    'postgres_changes',
    {
      event: '*',           // '*' para todos, o 'INSERT', 'UPDATE', 'DELETE'
      schema: 'public',
      table: 'nombre_tabla',
      filter: `company_id=eq.${companyId}`  // Filtro opcional por empresa
    },
    (payload) => callback(payload)
  );
  
  channel.subscribe();
    
  return channel;
}
```

### 2. Usar en el componente

```typescript
import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

export class MiListaComponent implements OnInit, OnDestroy {
  items = signal<Item[]>([]);
  subscription: RealtimeChannel | null = null;

  ngOnInit() {
    this.loadItems();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  setupRealtimeSubscription() {
    if (this.subscription) return;

    this.subscription = this.miService.subscribeToChanges((payload) => {
      if (payload.eventType === 'UPDATE') {
        this.handleUpdate(payload.new);
      } else if (payload.eventType === 'INSERT') {
        this.handleInsert(payload.new);
      } else if (payload.eventType === 'DELETE') {
        this.handleDelete(payload.old.id);
      }
    });
  }

  // Actualizar item existente en el signal (preserva datos joined)
  handleUpdate(updatedItem: any) {
    this.items.update(items => 
      items.map(item => 
        item.id === updatedItem.id 
          ? { ...item, ...updatedItem }  // Merge para preservar relaciones
          : item
      )
    );
    this.applyFilters(); // Si tienes filtros
  }

  // Agregar nuevo item
  handleInsert(newItem: any) {
    this.items.update(items => [newItem, ...items]);
    this.applyFilters();
  }

  // Eliminar item
  handleDelete(itemId: string) {
    this.items.update(items => items.filter(item => item.id !== itemId));
    this.applyFilters();
  }
}
```

## Estructura del Payload

El `payload` recibido tiene esta estructura:

```typescript
{
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  new: { ... },  // Datos nuevos (INSERT/UPDATE)
  old: { ... },  // Datos anteriores (UPDATE/DELETE)
  schema: 'public',
  table: 'nombre_tabla',
  commit_timestamp: '2025-12-13T...'
}
```

## Notas Importantes

1. **Nombre de canal único**: Usar `${Date.now()}` en el nombre evita conflictos entre tabs.

2. **Preservar datos joined**: El payload solo trae columnas de la tabla, no relaciones. Usar spread `{ ...item, ...updatedItem }` para preservar datos como `client`, `invoice`, etc.

3. **Filtro por company_id**: Siempre filtrar por `company_id` para multi-tenancy.

4. **Cleanup en ngOnDestroy**: Siempre llamar `subscription.unsubscribe()` al destruir el componente.

5. **Configuración de canal**: El objeto `config` con `broadcast` y `presence` mejora la compatibilidad.

## Ejemplo Implementado

Ver implementación completa en:
- Servicio: `src/app/services/supabase-quotes.service.ts` → `subscribeToQuoteChanges()`
- Componente: `src/app/modules/quotes/quote-list/quote-list.component.ts`
