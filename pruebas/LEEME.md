# Pruebas

## 1. Reglas de negocio y seguridad (SQL)
Requiere PostgreSQL 15+ local con la extensión btree_gist.
```
psql -U postgres -f 00_entorno_local.sql          # crea BD "citas" y emula auth.users / auth.uid()
psql -U postgres -d citas -f ../sql/esquema.sql -f ../sql/politicas_rls.sql -f ../sql/datos_prueba.sql
psql -U postgres -d citas -f pruebas_reglas_seguridad.sql
```
Cada bloque simula un usuario (`set local role authenticated` + `request.jwt.claim.sub`) y muestra el resultado esperado en el título.

## 2. Pruebas de navegador (E2E)
`e2e/mock_supabase.js` emula Supabase en `localhost:54321` (PostgREST en :3000 + autenticación simulada).
```
postgrest e2e/pgrst.conf &
node e2e/mock_supabase.js &          # requiere: npm i pg
python3 -m http.server 8080 &        # desde una copia del sitio con config.js apuntando a http://localhost:54321
node e2e/e2e.js                      # requiere Playwright
```
Las pruebas finales deben repetirse contra el proyecto real de Supabase y documentarse con capturas.
