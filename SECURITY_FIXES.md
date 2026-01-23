# Registro de Cambios de Seguridad y Mantenimiento

Fecha: 21 de enero de 2026
Estado: **Vulnerabilidades Resueltas (0 encontradas)**

Este documento detalla las acciones realizadas para corregir vulnerabilidades de seguridad y errores de compilación en el proyecto `simplifica`.

## 1. Corrección de Vulnerabilidades de Seguridad

### A. Vulnerabilidad XSS en Angular
*   **Problema:** Se detectó una vulnerabilidad de Cross-Site Scripting (XSS) en versiones anteriores de Angular relacionada con atributos SVG no saneados.
*   **Acción:** Se actualizaron todos los paquetes del núcleo de Angular (`@angular/core`, `@angular/common`, etc.) y `@angular/cli` a la versión **19.2.18**.
*   **Resultado:** La vulnerabilidad ha sido parcheada en esta versión.

### B. Denegación de Servicio (DoS) en `express` / `qs`
*   **Problema:** La librería `qs` (usada por `express` para analizar query strings) tenía una vulnerabilidad que permitía el agotamiento de memoria mediante arrays muy grandes.
*   **Acción:**
    1.  Se actualizó `express` a la versión **^4.21.2**.
    2.  Se añadió una regla de `overrides` en `package.json` para forzar el uso de `qs` versión **^6.14.1** en todo el árbol de dependencias.
*   **Resultado:** Se evita el uso de versiones vulnerables de `qs` incluso si otras librerías las solicitan.

### C. Sobrescritura Arbitraria de Archivos en `tar`
*   **Problema:** La librería `tar` (usada por muchas herramientas de CLI) permitía sobrescribir archivos fuera del directorio de destino.
*   **Acción:** Se añadió una regla de `overrides` en `package.json` para forzar el uso de `tar` versión **^7.5.5**.
*   **Resultado:** Se mitiga el riesgo de "Symlink Poisoning" y sobrescritura de archivos durante la instalación de paquetes.

## 2. Correcciones de Compilación y Mantenimiento

### A. Error de Tipos: `node-forge`
*   **Error:** `Could not find a declaration file for module 'node-forge'.`
*   **Causa:** La librería `node-forge` se estaba importando en el código TypeScript, pero faltaban sus definiciones de tipos, lo que provocaba un error con `noImplicitAny`.
*   **Solución:** Se instaló la dependencia de desarrollo `@types/node-forge`.

### B. Conflicto de Dependencias: `ng-apexcharts`
*   **Advertencia:** `unmet peer dependency @angular/core@^20.0.0`.
*   **Causa:** Se había instalado una versión muy reciente de `ng-apexcharts` (1.17.1) que esperaba Angular 20 (aún no estable), causando conflictos con tu versión actual (Angular 19).
*   **Solución:** Se fijó la versión de `ng-apexcharts` a **1.15.0**, que es totalmente compatible con Angular 19.

### C. Limpieza: `@types/dompurify`
*   **Advertencia:** `This is a stub types definition...`
*   **Causa:** La librería `dompurify` moderna ya incluye sus propios tipos, por lo que el paquete `@types/dompurify` era redundante y estaba obsoleto.
*   **Solución:** Se eliminó `@types/dompurify` de las dependencias.

---

## Cómo mantener esto en el futuro

1.  **Auditoría regular:** Ejecuta `pnpm audit` periódicamente para buscar nuevas vulnerabilidades.
2.  **Actualizaciones:** Mantén tus dependencias actualizadas. Las secciones `overrides` en `package.json` son útiles para parches de seguridad urgentes, pero idealmente deberían eliminarse cuando las librerías principales actualicen sus propias dependencias internas.
