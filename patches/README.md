# Parches de sincronización de las 3 apps

Cada archivo contiene **todos** los cambios hechos en un repositorio de una app para sincronizar con la vista central
(módulo nuevo, pruebas, enganches y documentación de la variable `CENTRAL_DATABASE_URL`). Se generaron sobre estos
commits de `main`:

| Parche | Repositorio | Base (`main`) |
|---|---|---|
| `REAL_ESTATE_SCRAPER.patch` | `InmobiliariaPolyline/REAL_ESTATE_SCRAPER` | `fe5ecf3` |
| `planner-backend.patch` | `InmobiliariaPolyline/planner-backend` | `a03a0ef` |
| `Sistema-MRP-EDC-VII.patch` | `InmobiliariaPolyline/Sistema-MRP-EDC-VII` | `4362269` |

## Cómo aplicarlos

```bash
git clone https://github.com/InmobiliariaPolyline/REAL_ESTATE_SCRAPER.git
cd REAL_ESTATE_SCRAPER
git checkout -b feature/sync-vista-central
git apply --check ../V1K/patches/REAL_ESTATE_SCRAPER.patch   # comprueba sin tocar nada
git apply ../V1K/patches/REAL_ESTATE_SCRAPER.patch
```

Repite con cada app. Después revisa el diff, corre las pruebas de la app y abre un Pull Request.
Los cambios no hacen nada hasta que se define `CENTRAL_DATABASE_URL` en el servidor de la app.

Si el `main` de la app avanzó desde esa base, `git apply --3way` ayuda a resolver diferencias.
