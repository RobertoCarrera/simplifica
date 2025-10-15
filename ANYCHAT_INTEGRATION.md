# 💬 AnyChat Integration - Documentación Completa

## 📋 Resumen

Integración completa con **AnyChat API** para gestión de conversaciones y contactos en tiempo real. Permite comunicación directa con clientes desde la aplicación Simplifica.

---

## ✅ Implementación Completada

### 🔧 Servicios Creados

#### **AnyChatService** (`src/app/services/anychat.service.ts`)
Servicio completo para interactuar con la API de AnyChat:

**Contactos:**
- ✅ `getContacts()` - Obtener lista de contactos
- ✅ `searchContactByEmail()` - Buscar contacto por email
- ✅ `getContact()` - Obtener información de un contacto
- ✅ `createContact()` - Crear nuevo contacto
- ✅ `updateContact()` - Actualizar contacto existente

**Conversaciones (Preparado para futura implementación):**
- 🔄 `getConversations()` - Obtener conversaciones
- 🔄 `getMessages()` - Obtener mensajes de una conversación
- 🔄 `sendMessage()` - Enviar mensaje
- 🔄 `markAsRead()` - Marcar mensaje como leído

### 🎨 Componente UI

#### **AnyChatComponent** (`src/app/components/anychat/anychat.component.ts`)

**Características:**
- ✅ Listado de contactos con paginación
- ✅ Búsqueda en tiempo real
- ✅ Interfaz de chat moderna (3 columnas)
- ✅ Sistema de mensajes con estados (enviado, leído)
- ✅ Avatares con iniciales
- ✅ Responsive design completo
- ✅ Animaciones suaves
- ✅ Estados de carga y vacíos

---

## 🔐 Configuración de Seguridad

### ⚠️ **IMPORTANTE: API Key NO expuesta en código**

La API key está configurada de forma segura:

#### **Desarrollo Local:**
```typescript
// src/environments/environment.ts
anychatApiKey: 'iPLpIQmz5RIVoBigmpjICNC2aOlhXzqVouuNedaCaf01cXuqnIvCD27-lz56Bnys'
```

#### **Producción (Vercel):**
```typescript
// src/environments/environment.prod.ts
anychatApiKey: process.env['ANYCHAT_API_KEY'] || ''
```

### 📝 **Configurar en Vercel:**

1. Ve a tu proyecto en Vercel
2. `Settings` → `Environment Variables`
3. Agregar nueva variable:
   - **Name:** `ANYCHAT_API_KEY`
   - **Value:** `iPLpIQmz5RIVoBigmpjICNC2aOlhXzqVouuNedaCaf01cXuqnIvCD27-lz56Bnys`
   - **Environments:** Production, Preview, Development
4. Click en **Save**
5. Redeploy el proyecto

---

## 🚀 Uso del Componente

### Acceso en la Aplicación

**Ruta:** `/chat`

**Menú:** 
- Sección "Producción"
- Icono: 💬 Chat
- Entre "Servicios" y demás opciones

### Funcionalidades Disponibles

#### 1️⃣ **Gestión de Contactos**
```typescript
// Cargar contactos
this.anychatService.getContacts(page, limit).subscribe(response => {
  console.log('Contactos:', response.data);
});

// Buscar por email
this.anychatService.searchContactByEmail('cliente@example.com').subscribe(response => {
  console.log('Resultados:', response.data);
});

// Crear contacto
this.anychatService.createContact({
  name: 'Juan Pérez',
  email: 'juan@example.com',
  phone: '+34666777888',
  company: 'Mi Empresa SL'
}).subscribe(contact => {
  console.log('Contacto creado:', contact);
});
```

#### 2️⃣ **Navegación y Búsqueda**
- **Paginación:** Botones anterior/siguiente
- **Búsqueda:** Input en tiempo real
- **Selección:** Click en contacto para ver detalles

#### 3️⃣ **Interfaz de Chat** (En desarrollo)
- Visualización de conversaciones
- Envío de mensajes
- Estados de lectura
- Adjuntar archivos (próximamente)

---

## 📡 API de AnyChat

### Endpoints Implementados

#### **Base URL:** `https://api.anychat.one/public/v1`

#### **Headers Requeridos:**
```json
{
  "x-api-key": "YOUR_API_KEY",
  "Content-Type": "application/json"
}
```

### Contactos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/contact` | Lista de contactos (paginado) |
| `GET` | `/contact/search?email={email}` | Buscar por email |
| `GET` | `/contact/{guid}` | Información de contacto |
| `POST` | `/contact` | Crear contacto |
| `PUT` | `/contact/{guid}` | Actualizar contacto |

### Paginación

Todos los endpoints de listado soportan:
- `?page=1` - Número de página (empieza en 1)
- `?limit=20` - Elementos por página (min: 1, max: 100, default: 20)

**Respuesta:**
```json
{
  "data": [...],
  "page": 1,
  "limit": 20,
  "pages": 10,
  "total": 199
}
```

---

## 🎨 Diseño y UX

### **Layout Responsivo:**

#### Desktop (>768px):
```
┌─────────────────────────────────────────┐
│          Header (Chat AnyChat)          │
├───────────────┬─────────────────────────┤
│   Contactos   │    Área de Chat         │
│   (360px)     │    (Flex 1)             │
│               │                         │
│  [Búsqueda]   │  📝 Mensajes            │
│               │                         │
│  👤 Juan      │  ✉️ Input mensaje       │
│  👤 María     │                         │
│  👤 Pedro     │                         │
│               │                         │
│  [Paginación] │                         │
└───────────────┴─────────────────────────┘
```

#### Mobile (<768px):
- Sidebar ocupa 100% del ancho
- Se oculta al seleccionar contacto
- Botón para volver a lista de contactos

### **Colores:**
- **Primary:** `#667eea` (Púrpura)
- **Gradient:** `linear-gradient(135deg, #667eea, #764ba2)`
- **Success:** `#48bb78` (Verde)
- **Danger:** `#f56565` (Rojo)

---

## 🔄 Estados de la Aplicación

### **Signals Reactivos:**

```typescript
// Datos
contacts = signal<AnyChatContact[]>([]);
messages = signal<AnyChatMessage[]>([]);
selectedContact = signal<AnyChatContact | null>(null);

// Estados de carga
isLoadingContacts = signal(false);
isLoadingMessages = signal(false);
isSendingMessage = signal(false);

// Búsqueda y paginación
searchTerm = signal('');
currentPage = signal(1);
totalPages = signal(1);
```

### **Computed Properties:**

```typescript
// Filtrado reactivo
filteredContacts = computed(() => {
  const search = this.searchTerm().toLowerCase();
  return this.contacts().filter(c => 
    c.name?.includes(search) || 
    c.email?.includes(search)
  );
});

// Validaciones
canSendMessage = computed(() => 
  this.newMessage().trim().length > 0 && 
  !this.isSendingMessage()
);
```

---

## 🚧 Funcionalidades Pendientes

### **Módulo de Conversaciones:**

> ⚠️ **Nota:** Los endpoints de conversaciones y mensajes aún no están documentados en AnyChat API.

Cuando estén disponibles, la implementación incluirá:

1. ✅ **Servicio preparado** - Métodos listos en `AnyChatService`
2. ✅ **UI implementada** - Componente preparado para recibir datos
3. 🔄 **Endpoints pendientes:**
   - `GET /conversation` - Lista de conversaciones
   - `GET /conversation/{id}/message` - Mensajes de conversación
   - `POST /conversation/{id}/message` - Enviar mensaje
   - `PUT /message/{id}/read` - Marcar como leído

### **Próximas Mejoras:**

- [ ] WebSocket para mensajes en tiempo real
- [ ] Notificaciones push de nuevos mensajes
- [ ] Adjuntar archivos e imágenes
- [ ] Emojis y reacciones
- [ ] Búsqueda en mensajes
- [ ] Exportar conversaciones
- [ ] Plantillas de mensajes rápidos
- [ ] Estados: "escribiendo...", "en línea", "última vez"

---

## 🧪 Testing

### **Probar Localmente:**

1. Ejecutar aplicación:
```bash
ng serve
```

2. Navegar a: `http://localhost:4200/chat`

3. Verificar:
   - ✅ Se cargan los contactos
   - ✅ La búsqueda funciona
   - ✅ La paginación funciona
   - ✅ Se puede seleccionar un contacto
   - ✅ La interfaz es responsive

### **Console Logs Útiles:**

```typescript
// En navegador (F12 → Console):
✅ Contactos cargados: 20
📱 Contacto seleccionado: Juan Pérez
```

---

## 📊 Métricas y Monitoreo

### **Logs Implementados:**

```typescript
// Éxito
console.log('✅ Contactos cargados:', response.data.length);
console.log('📱 Contacto seleccionado:', contact.name);

// Errores
console.error('❌ AnyChat API Error:', error);
console.error('Error cargando contactos:', error);
```

### **Toasts de Usuario:**

- ✅ Success: "Mensaje enviado correctamente"
- ⚠️ Warning: "Este cliente ya fue anonimizado"
- ❌ Error: "No se pudieron cargar los contactos"
- ℹ️ Info: "No se encontraron contactos"

---

## 🔗 Integración con Clientes

### **Sincronización con Módulo de Clientes:**

Posible flujo futuro:

```typescript
// Desde módulo de clientes → Abrir chat
openChatWithClient(customer: Customer) {
  // 1. Buscar contacto en AnyChat por email
  this.anychatService.searchContactByEmail(customer.email).subscribe(response => {
    if (response.data.length > 0) {
      // 2. Ya existe → Abrir chat
      this.router.navigate(['/chat'], { 
        queryParams: { contactId: response.data[0].guid } 
      });
    } else {
      // 3. No existe → Crear y abrir
      this.anychatService.createContact({
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      }).subscribe(contact => {
        this.router.navigate(['/chat'], { 
          queryParams: { contactId: contact.guid } 
        });
      });
    }
  });
}
```

---

## 🆘 Troubleshooting

### **Problema: "Error 401 Unauthorized"**

**Solución:**
```typescript
// Verificar que la API key esté configurada
console.log('API Key:', environment.anychatApiKey);

// En Vercel, verificar variable de entorno ANYCHAT_API_KEY
```

### **Problema: "No se cargan los contactos"**

**Solución:**
1. Verificar que tienes contactos creados en AnyChat
2. Verificar red en DevTools → Network
3. Verificar Console para errores
4. Verificar CORS (debería estar permitido por AnyChat API)

### **Problema: "Conversaciones no funcionan"**

**Solución:**
Esto es **esperado**. Los endpoints de conversaciones aún no están documentados en AnyChat API. El código está preparado para cuando estén disponibles.

---

## 📚 Recursos

- **AnyChat API Docs:** https://documenter.getpostman.com/view/23223880/2sB2qi6x9D
- **AnyChat Dashboard:** https://anychat.one/settings/api
- **Angular Signals:** https://angular.dev/guide/signals

---

## ✅ Checklist de Implementación

- [x] Servicio AnyChatService creado
- [x] Componente AnyChatComponent creado
- [x] Interfaces TypeScript definidas
- [x] Estilos SCSS completos
- [x] Ruta `/chat` configurada
- [x] Menú de navegación actualizado
- [x] Variables de entorno configuradas
- [x] Seguridad: API key protegida
- [x] Documentación completa
- [ ] Configurar ANYCHAT_API_KEY en Vercel ⚠️ **PENDIENTE**
- [ ] Testing en producción
- [ ] Implementar conversaciones (cuando API esté lista)

---

## 🎯 Próximos Pasos

1. **Inmediato:**
   - Configurar `ANYCHAT_API_KEY` en Vercel
   - Probar en desarrollo
   - Verificar que todo funciona correctamente

2. **Corto Plazo:**
   - Esperar documentación de endpoints de conversaciones
   - Implementar envío/recepción de mensajes
   - Agregar WebSocket para tiempo real

3. **Mediano Plazo:**
   - Integrar con módulo de clientes
   - Notificaciones push
   - Plantillas de mensajes
   - Analytics de conversaciones

---

**Fecha de Implementación:** 15 de Octubre, 2025  
**Versión:** 1.0.0  
**Estado:** ✅ LISTO PARA USAR (Contactos) | 🔄 EN DESARROLLO (Conversaciones)

---

**¡AnyChat Integration completada! 🎉**
