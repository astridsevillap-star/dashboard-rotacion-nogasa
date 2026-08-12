# Dashboard de Rotación Nogasa — GitHub + Vercel

Proyecto Next.js listo para abrir en VS Code, guardar en GitHub y publicar en Vercel. Los datos se conservan en PostgreSQL de Supabase, dentro de la organización Nogasa.

## Lo que conserva esta versión

- Diseño completo del dashboard.
- Datos históricos de enero a junio de 2026 incluidos en el proyecto.
- Carga mensual de planilla y archivo de términos en Excel.
- Periodos dinámicos: cada mes nuevo aparece automáticamente.
- Rotación total, rotación del trabajador y de la empresa.
- Deserción antes de 3 meses y acumulada hasta 6 meses.
- Gráficos curvos, filtros, mapa de calor y áreas a revisar.
- Base de datos persistente para los meses que se carguen después.
- Clave privada para impedir que cualquier visitante actualice los datos.

## 1. Abrirlo en VS Code

1. Descomprime este ZIP.
2. En VS Code entra a **Archivo > Abrir carpeta** y selecciona `dashboard-rotacion-vercel`.
3. Abre una terminal en VS Code.
4. Ejecuta:

```bash
npm install
```

## 2. Crear el repositorio en GitHub

En la terminal de VS Code ejecuta:

```bash
git init
git add .
git commit -m "Dashboard de rotación listo para Vercel"
git branch -M main
```

En GitHub crea un repositorio vacío, preferiblemente privado, llamado `dashboard-rotacion-nogasa`. No agregues README ni `.gitignore` desde GitHub.

Luego copia la URL que GitHub muestre y ejecuta:

```bash
git remote add origin https://github.com/TU-USUARIO/dashboard-rotacion-nogasa.git
git push -u origin main
```

Reemplaza `TU-USUARIO` por el usuario de tu otra cuenta de GitHub.

## 3. Importar el proyecto en Vercel

1. Ingresa a Vercel con tu cuenta.
2. Selecciona **Add New > Project**.
3. Importa `dashboard-rotacion-nogasa` desde GitHub.
4. Vercel detectará automáticamente Next.js.
5. Todavía no presiones el despliegue final hasta completar la base de datos.

## 4. Conectar Supabase

1. Abra el proyecto de la organización **Nogasa** en Supabase.
2. Pulse **Connect > Direct > Connection string**.
3. Seleccione **Session pooler** y copie la URI del puerto `5432`.
4. Sustituya `[YOUR-PASSWORD]` por la contraseña de la base de datos, sin dejar corchetes.
5. En **Vercel > Project > Settings > Environment Variables**, cree `SUPABASE_DATABASE_URL`.
6. Guarde la variable como sensible para **Production** y **Preview**. No utilice el prefijo `NEXT_PUBLIC_`.

## 5. Crear la clave para actualizar archivos

En **Vercel > Project > Settings > Environment Variables**, crea:

| Variable | Valor |
| --- | --- |
| `UPLOAD_PASSWORD` | Una contraseña segura elegida por ti |

Marca los ambientes **Production**, **Preview** y **Development**. Esta clave se solicita únicamente al cargar un nuevo mes y nunca se guarda en el navegador.

## 6. Desplegar

Después de conectar Neon y crear `UPLOAD_PASSWORD`:

1. Ve a **Deployments**.
2. Ejecuta **Redeploy** sobre el último despliegue o vuelve a presionar **Deploy**.
3. Abre la dirección terminada en `.vercel.app`.

## 7. Probar una actualización mensual

En el bloque **Actualización mensual** carga:

1. La planilla del nuevo mes.
2. El archivo de términos actualizado.
3. La clave configurada en `UPLOAD_PASSWORD`.

El procesamiento de DNI y nombres ocurre en el navegador. A la base solo se envían y guardan resultados agregados por periodo, gerencia, dotación, región y categoría.

## Probarlo localmente — opcional

1. Copia `.env.example` como `.env.local`.
2. Coloca en `DATABASE_URL` la conexión de Neon.
3. Coloca la misma clave de actualización en `UPLOAD_PASSWORD`.
4. Ejecuta:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Actualizaciones futuras

Después de modificar el código:

```bash
git add .
git commit -m "Describe el cambio realizado"
git push
```

Vercel publicará automáticamente cada cambio enviado a la rama `main`.

## Seguridad

- No subas `.env.local` a GitHub.
- Mantén el repositorio privado si el dashboard es de uso interno.
- Cambia `UPLOAD_PASSWORD` desde Vercel si una persona deja de estar autorizada.
- El DNI nunca se almacena: se convierte en un hash irreversible antes de salir del navegador.
- El nombre (columna "NOMBRES Y APELLIDOS" de la Planilla) sí se guarda en texto plano en `uploaded_payroll`, únicamente para poder identificar a la persona en `/clasificacion`. Esa pantalla está protegida por `UPLOAD_PASSWORD` y no es accesible sin la clave. Si prefieres no guardar nombres, simplemente no incluyas esa columna al cargar la Planilla.
