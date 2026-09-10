// scripts/_shims/server-only.ts
//
// `server-only` es un paquete cuya única función es REVENTAR el build cuando un módulo de
// servidor se cuela en el bundle del cliente. No está en `node_modules`: Next y `next/jest`
// lo resuelven con sus propios alias, así que fuera de esos dos entornos no existe.
//
// Un script de `scripts/` corre en Node pelado, donde no hay bundle de cliente al que
// colarse — así que acá la guarda no tiene nada que proteger y un módulo vacío es la
// traducción honesta.
//
// **Vive sólo en `tsconfig.scripts.json` y NO en el tsconfig de la aplicación.** Mapearlo en
// el tsconfig principal desactivaría la guarda en todo el proyecto, que es justamente la que
// impide que `lib/db.ts` o la bitácora terminen en el navegador.
export {};
