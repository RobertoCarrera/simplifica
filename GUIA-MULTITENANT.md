# GUÍA: Configurar Multi-Tenant Local para Testing

## 📋 Paso 1: Configurar archivo hosts (IMPORTANTE)

### Windows:
1. **Abrir Bloc de notas como ADMINISTRADOR**
2. **Abrir archivo**: `C:\Windows\System32\drivers\etc\hosts`
3. **Agregar al final del archivo**:
```
127.0.0.1 crm.michinanny.local
127.0.0.1 admin.anscarr.local
127.0.0.1 panel.liberatuscreencias.local
127.0.0.1 crm.satpcgo.local
127.0.0.1 admin.tudominio.local
```
4. **Guardar el archivo**

### Linux/Mac:
```bash
sudo nano /etc/hosts
# Agregar las mismas líneas
```

## 🚀 Paso 2: Iniciar el servidor

```bash
ng serve --host 0.0.0.0 --port 4200
```

## 🌐 Paso 3: Probar las URLs

- **http://localhost:4200** → Vista Desarrollo (Super Admin)
- **http://crm.michinanny.local:4200** → Vista Michinanny 
- **http://admin.anscarr.local:4200** → Vista Anscarr
- **http://admin.tudominio.local:4200** → Vista Super Admin

## 🔍 Verificar funcionamiento:

### Vista Michinanny (solo servicios):
- ✅ Debería mostrar: "Dashboard - Michinanny"
- ✅ Sidebar: Inicio, Servicios, Taller, Clientes
- ❌ NO debería mostrar: Presupuestos, Facturas, Material, Test DB

### Vista Anscarr (todos los módulos):
- ✅ Debería mostrar: "Dashboard - Anscarr" 
- ✅ Sidebar: Todos los módulos disponibles
- ❌ NO debería mostrar: Test DB

### Vista Super Admin:
- ✅ Debería mostrar: "Dashboard - Super Administrador"
- ✅ Sidebar: Todos los módulos + Test DB

## ⚠️ Troubleshooting:

### Si sale "ERR_CONNECTION_REFUSED":
1. Verificar que el archivo hosts esté guardado correctamente
2. Ejecutar `ipconfig /flushdns` en cmd como admin
3. Reiniciar el navegador
4. Verificar que el servidor esté corriendo con `--host 0.0.0.0`

### Si no cambia el tenant:
1. Abrir DevTools (F12)
2. Ver Console para logs del tenant service
3. Verificar que aparezca: "🏢 Detecting tenant from hostname"
