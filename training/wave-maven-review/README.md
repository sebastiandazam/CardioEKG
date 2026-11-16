# Revisión reproducible de Wave-Maven

`review_cases.py` recorre los identificadores únicos del índice público, conserva historia/pregunta y explicación completas en una caché de investigación ignorada por Git, e inventaría los enlaces a imágenes y PDF. El informe versionado solo contiene procedencia, hashes, estados, identificadores y categorías derivadas; no copia las explicaciones ni distribuye imágenes nuevas.

```sh
python training/wave-maven-review/review_cases.py
```

La primera ejecución usa como máximo dos solicitudes simultáneas y la ruta pública «Continue» con los campos opcionales vacíos. Reutiliza cada HTML validado por SHA-256 en ejecuciones posteriores. `--workers 1` reduce la concurrencia; `--refresh` vuelve a obtener las páginas. No requiere cuentas, servicios pagos ni GPU. Un fallo se registra por identificador y no se sustituye por datos inventados. La caché predeterminada es `artifacts/wave-maven-review/`, que ya está ignorada por el repositorio.

Interfaz privada por caso: `artifacts/wave-maven-review/annotations/case-ID.json` incluye `history_question`, `answer_explanation`, `reference_diagnosis`, `assets` y `source_url`. Estos archivos **no son entradas para el clasificador**: contienen respuestas. `html/` guarda el documento fuente y `http/` su URL final, fecha, estado y hash. `coverage.json` es el resumen derivado y reproducible; [el informe de alcance](../../docs/wave-maven-review.md) explica los resultados y límites.

Las categorías son coincidencias de patrones no excluyentes sobre diagnósticos del catálogo. Los temas son coincidencias literales sobre historia y explicación. Ambos sirven para auditar cobertura, no como anotaciones clínicas adjudicadas. El número de vínculos de recursos no demuestra disponibilidad del archivo ni número de ECG independientes: esta revisión no descarga todos los PDF/imágenes.

No entrena, ajusta ni ejecuta un modelo diagnóstico. Para futuros experimentos, separar las entradas prospectivas (imagen e historia legítimamente disponible) de las respuestas del evaluador. Nunca concatenar `reference_diagnosis` o `answer_explanation` a la entrada, usar una búsqueda del ID como predicción, ni interpretar acierto en un caso ya estudiado como validación independiente.

La descarga experimental posterior se ejecuta por separado:

```sh
python training/wave-maven-review/download_assets.py
```

Guarda un PDF original por caso en `artifacts/wave-maven-review/pdf/`, reutiliza los seis originales existentes y omite las dos versiones GIF del mismo caso. `asset-manifest.json` contiene rutas privadas para el proceso experimental; `asset-coverage.json` publica solo metadatos de descarga. Descargar los datos tampoco equivale a entrenar. Cualquier script de entrenamiento y sus métricas deben declarar cuántas imágenes realmente procesaron y qué partición evaluaron.
