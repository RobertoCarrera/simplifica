# Plantilla de Proyecto Moderno - SIMPLIFICA

> **Nota para Desarrolladores:** Para entender la arquitectura, convenciones de código y contexto técnico detallado, por favor consulta [DEVELOPMENT.md](./DEVELOPMENT.md).

Este proyecto está preconfigurado para desarrollo ágil, seguro y profesional con las siguientes herramientas:

## Herramientas incluidas
- **Supabase CLI**: Migraciones, tests y gestión de base de datos.
- **ESLint**: Linting automático para JS/TS.
- **Prettier**: Formateo de código consistente.
- **Husky + lint-staged**: Hooks de git para validar y formatear código antes de cada commit.
- **Jest**: Testing unitario listo para TypeScript.
- **Scripts útiles** en `package.json` para automatizar tareas comunes.

## Primeros pasos
1. Instala dependencias:
   ```bash
   npm install
   ```
2. Inicializa Husky (solo la primera vez):
   ```bash
   npx husky install
   ```
3. Configura tu conexión a Supabase:
   ```bash
   supabase login
   # y configura tu proyecto si es necesario
   ```

## Scripts disponibles
- `npm run lint` — Linting de todo el proyecto
- `npm run format` — Formateo de todo el código
- `npm run test:unit` — Ejecuta tests unitarios con Jest
- `npm run supabase:migrate` — Aplica migraciones a la base de datos
- `npm run supabase:studio` — Abre Supabase Studio local
- `npm run supabase:start` — Inicia Supabase localmente

## Hooks automáticos
- **pre-commit**: Linting y formateo solo de archivos modificados
- **pre-push**: Corre los tests unitarios antes de subir cambios

## Recomendaciones
- Añade tus variables de entorno en `.env` y exclúyelo en `.gitignore`.
- Instala extensiones recomendadas en VS Code: ESLint, Prettier, Supabase, Angular, Tailwind CSS.

---

Puedes ir ampliando este README con instrucciones específicas de tu proyecto, convenciones de equipo, o cualquier herramienta adicional.
