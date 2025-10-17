# 🔧 Solución de Errores CORS y Supabase

## 📋 Resumen de Errores Encontrados

### 1. ❌ Error CORS de AnyChat API
```
Access to fetch at 'https://api.anychat.one/public/v1/contact?page=1&limit=20' 
from origin 'https://simplifica.digitalizamostupyme.es' has been blocked by CORS policy
```

**Causa**: La API de AnyChat no tiene configurado tu dominio en sus CORS headers.

### 2. ❌ Error 400 en Consulta de Clientes
```
Failed to load resource: the server responded with a status of 400 ()
.../clients?select=*,direccion:addresses!clients_direccion_id_fkey(*)&company_id=...
```

**Causa**: Problema con la foreign key `clients_direccion_id_fkey` o permisos RLS.

### 3. ❌ Error de Lock Manager
```
Acquiring an exclusive Navigator LockManager lock "lock:sb-main-auth-token" immediately failed
```

**Causa**: Múltiples tabs/ventanas intentando acceder al mismo token de Supabase simultáneamente.

### 4. ❌ Error de Parsing HTTP
```
Error 200: Http failure during parsing for https://simplifica.digitalizamostupyme.es/index.html
```

**Causa**: Respuesta malformada o tipo MIME incorrecto.

---

## ✅ Soluciones Implementadas

### 1. Mejora del Servicio AnyChat

#### ✅ Validación de API Key
```typescript
if (!this.API_KEY || this.API_KEY.trim() === '') {
  console.warn('⚠️ AnyChat API Key no configurada');
  return throwError(() => new Error('AnyChat API Key no configurada'));
}
```

#### ✅ Manejo de Errores CORS
```typescript
catchError((error) => {
  if (error.status === 0) {
    console.error('❌ Error CORS: La API de AnyChat no permite peticiones desde este dominio');
    return throwError(() => new Error('Error CORS: Verifica la configuración de AnyChat API'));
  }
  return this.handleError(error);
})
```

#### ✅ Configuración de Peticiones HTTP
```typescript
return this.http.get<AnyChatPaginatedResponse<AnyChatContact>>(url, { 
  headers: this.getHeaders(),
  withCredentials: false  // ← Importante para CORS
});
```

### 2. Mejora del Componente AnyChat

#### ✅ Mensajes de Error Específicos
```typescript
if (error.message?.includes('CORS')) {
  this.toastService.error(
    'Error de Configuración', 
    'La API de AnyChat requiere configuración adicional. Contacta con soporte.'
  );
} else if (error.message?.includes('API Key')) {
  this.toastService.error(
    'Configuración Requerida', 
    'Falta configurar la API Key de AnyChat'
  );
}
```

---

## 🚀 Acciones Necesarias

### A. Para Solucionar Error CORS de AnyChat

**Opción 1: Configurar CORS en AnyChat (RECOMENDADO)**
1. Contacta con soporte de AnyChat
2. Solicita agregar tu dominio a la whitelist:
   - `https://simplifica.digitalizamostupyme.es`
   - `http://localhost:4200` (desarrollo)

**Opción 2: Usar Proxy Backend (TEMPORAL)**
```typescript
// En tu backend Node.js/Express
app.use('/api/anychat', createProxyMiddleware({
  target: 'https://api.anychat.one',
  changeOrigin: true,
  pathRewrite: {
    '^/api/anychat': '/public/v1'
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('x-api-key', process.env.ANYCHAT_API_KEY);
  }
}));
```

Luego modifica `anychat.service.ts`:
```typescript
private readonly API_URL = '/api/anychat'; // Usar proxy local
```

**Opción 3: Deshabilitar Temporalmente (SOLO DESARROLLO)**
```typescript
// En anychat.component.ts - ngOnInit()
ngOnInit(): void {
  // Comentar temporalmente
  // this.loadContacts();
  
  console.warn('⚠️ Carga de contactos deshabilitada temporalmente');
}
```

### B. Para Solucionar Error 400 de Clientes

#### 1. Verificar Foreign Key en Supabase

```sql
-- Ejecutar en SQL Editor de Supabase
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM 
  information_schema.table_constraints AS tc 
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name='clients'
  AND tc.constraint_name = 'clients_direccion_id_fkey';
```

#### 2. Si la FK no existe, créala:

```sql
-- Solo si no existe
ALTER TABLE clients
ADD CONSTRAINT clients_direccion_id_fkey
FOREIGN KEY (direccion_id)
REFERENCES addresses(id);
```

#### 3. Verificar Permisos RLS en tabla `addresses`

```sql
-- Ver políticas actuales
SELECT * FROM pg_policies WHERE tablename = 'addresses';

-- Agregar política si falta
CREATE POLICY "Usuarios pueden ver direcciones de su empresa"
ON addresses FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM user_companies 
    WHERE user_id = auth.uid()
  )
);
```

### C. Para Solucionar Error de Lock Manager

#### Opción 1: Implementar Storage Compartido (RECOMENDADO)

```typescript
// En supabase.service.ts o configuración inicial
import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  environment.supabase.url,
  environment.supabase.anonKey,
  {
    auth: {
      storage: window.localStorage, // O window.sessionStorage
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Usar BroadcastChannel para sincronizar entre tabs
      storageKey: 'sb-auth-token'
    }
  }
);
```

#### Opción 2: Detectar y Manejar Tabs Múltiples

```typescript
// En app.component.ts
export class AppComponent implements OnInit {
  ngOnInit() {
    // Detectar si hay otra tab abierta
    const lockKey = 'app-instance-lock';
    const instanceId = Date.now().toString();
    
    localStorage.setItem(lockKey, instanceId);
    
    window.addEventListener('storage', (e) => {
      if (e.key === lockKey && e.newValue !== instanceId) {
        console.warn('⚠️ Múltiples tabs detectadas');
        // Opcional: Mostrar warning al usuario
      }
    });
  }
}
```

### D. Para Solucionar Error de Parsing HTTP

#### 1. Verificar Headers de Respuesta

```typescript
// En interceptor o servicio HTTP
return next.handle(req).pipe(
  tap(event => {
    if (event instanceof HttpResponse) {
      const contentType = event.headers.get('content-type');
      console.log('Content-Type:', contentType);
      
      // Verificar que sea JSON válido
      if (contentType && !contentType.includes('application/json')) {
        console.warn('⚠️ Respuesta no es JSON:', contentType);
      }
    }
  })
);
```

#### 2. Agregar Manejo de Errores Global

```typescript
// En http-error.interceptor.ts
@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 200 && error.error instanceof ProgressEvent) {
          console.error('❌ Error de parsing en respuesta 200:', error);
          return throwError(() => new Error('Error de formato en la respuesta del servidor'));
        }
        return throwError(() => error);
      })
    );
  }
}
```

---

## 🧪 Testing

### 1. Test de AnyChat API

```bash
# Desde terminal
curl -X GET "https://api.anychat.one/public/v1/contact?page=1&limit=1" \
  -H "x-api-key: iPLpIQmz5RIVoBigmpjICNC2aOlhXzqVouuNedaCaf01cXuqnIvCD27-lz56Bnys" \
  -H "Content-Type: application/json"
```

### 2. Test de Query de Clientes

```typescript
// En navegador console
supabase
  .from('clients')
  .select('*, direccion:addresses!clients_direccion_id_fkey(*)')
  .eq('company_id', 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5')
  .limit(1)
  .then(console.log);
```

---

## 📊 Estado de Implementación

- [x] ✅ Validación de API Key en AnyChat Service
- [x] ✅ Manejo de errores CORS en AnyChat Service
- [x] ✅ Mensajes de error específicos en AnyChat Component
- [ ] ⏳ Configurar CORS en AnyChat API (requiere contacto con soporte)
- [ ] ⏳ Verificar/crear FK en tabla clients
- [ ] ⏳ Verificar políticas RLS en tabla addresses
- [ ] ⏳ Implementar storage compartido para tokens
- [ ] ⏳ Agregar interceptor de errores HTTP global

---

## 🎯 Próximos Pasos

1. **Inmediato**: Deshabilitar temporalmente carga de AnyChat si bloquea la app
2. **Corto Plazo**: Contactar soporte de AnyChat para CORS
3. **Medio Plazo**: Revisar y corregir foreign keys en Supabase
4. **Largo Plazo**: Implementar proxy backend para AnyChat

---

## 📞 Soporte

- **AnyChat**: Solicitar whitelist de dominio
- **Supabase**: Revisar RLS y foreign keys
- **Dev Team**: Implementar mejoras de manejo de errores
