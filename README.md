# CV Auto Applier 🤖💼

Automatizador de postulaciones de empleo en segundo plano para **InfoJobs (API Oficial)**, **CompuTrabajo (Playwright)** y **Bumeran (Playwright)**, integrado con la **API de Gemini** para responder killer/filter questions de forma inteligente en base a tu CV.

Diseñado para correr en segundo plano (Daemon) dentro de un contenedor Docker local o VPS mientras estás fuera de casa o de viaje.

---

## 🛠️ Requisitos e Instalación

### 1. Clonar/Ubicar el Proyecto
Este proyecto ha sido creado en tu Escritorio: `~/Desktop/cv-auto-applier`.

### 2. Configurar Variables de Entorno (`.env`)
Abre el archivo `.env` y configura tus opciones de búsqueda. Ya hemos configurado tu **Gemini API Key**.

*   `JOB_KEYWORDS`: Palabras clave separadas por comas (ej. `Node.js,React,Backend`).
*   `JOB_LOCATIONS`: Provincias o modalidades separadas por comas (ej. `Lima,Remoto`).
*   `RUN_INTERVAL_HOURS`: Cada cuántas horas se ejecutará el ciclo de búsqueda y postulación en Docker (ej. `12` para ejecutarse dos veces al día).
*   `DRY_RUN`: Por defecto está en `true` para hacer pruebas seguras. Cambia a `false` cuando quieras postularte de verdad.

### 3. Configurar tu CV (`cv-profile.json`)
Abre `cv-profile.json` y edita la información profesional con tus datos reales. Gemini usará este archivo exacto para leer tu experiencia laboral y redactar respuestas coherentes si los formularios de empleo tienen preguntas de filtro.

---

## 🍪 Cómo Extraer las Cookies de Sesión (Crucial para CompuTrabajo y Bumeran)

Dado que estas plataformas no tienen APIs públicas para candidatos, cargamos tus sesiones activas a través de archivos de cookies en formato JSON para evadir captchas y pantallas de Login.

1.  Instala una extensión en tu navegador como **EditThisCookie** o **Get cookies.txt LOCALLY**.
2.  Inicia sesión normalmente en tu navegador en [CompuTrabajo](https://www.computrabajo.com.pe) y/o [Bumeran](https://www.bumeran.com.pe).
3.  Usa la extensión para exportar las cookies en formato **JSON**.
4.  Crea dos archivos en la carpeta `cookies/` del proyecto y pega el contenido JSON:
    *   `cookies/computrabajo.json`
    *   `cookies/bumeran.json`

*Nota: Mientras no caduquen tus sesiones en los portales reales, estas cookies mantendrán al bot autenticado durante semanas o meses.*

---

## 🚀 Modos de Ejecución

### Modo Local (Para probar)

Asegúrate de tener Node.js (v20+) instalado en tu sistema local.

1.  Instala dependencias y compila:
    ```bash
    npm install
    npx playwright install chromium  # Descarga el navegador headless para pruebas locales
    npm run build
    ```
2.  Ejecuta en modo **Dry-Run** (Prueba Segura - No envía postulaciones):
    ```bash
    npm run dry-run
    ```
    *Esto buscará ofertas, abrirá el navegador en segundo plano, simulará el llenado de respuestas filtro con Gemini y tomará capturas de pantalla de los formularios rellenados en `logs/computrabajo/` y `logs/bumeran/` para que verifiques que las respuestas generadas sean correctas.*

3.  Ejecuta para postularte de verdad (Asegúrate de tener `DRY_RUN=false` en el `.env`):
    ```bash
    npm start
    ```

---

### Modo Docker (Despliegue en Segundo Plano)

Para dejarlo corriendo continuamente en tu servidor, VPS o computadora de casa:

1.  Inicia el contenedor en segundo plano:
    ```bash
    docker compose up --build -d
    ```
2.  Ver los logs de actividad en vivo:
    ```bash
    docker compose logs -f
    ```
3.  Detener el servicio:
    ```bash
    docker compose down
    ```

Dado que las carpetas `cookies/`, `logs/` y el archivo `cv-profile.json` están montados como volúmenes en Docker, puedes editar tu perfil o actualizar tus cookies JSON en cualquier momento desde tu Escritorio sin necesidad de reconstruir o apagar el contenedor.
