# Ampliación bibliográfica — KB 1.4.0

Fecha: 2026-11-13. Producto v22.1; análisis 2.7.0; motor Python sin cambios (signals-v3.2).

Se incorporan 24 referencias nuevas: 10 de ritmo/conducción y 11 de isquemia, repolarización o estructura, más tres correcciones de la guía ACS 2025. Se consulta de nuevo la guía de miocardiopatías de 2023. El catálogo contiene 130 referencias, con 25 registros de secciones del texto consultadas y 105 registros anteriores. No significa que se hayan leído íntegramente 130 publicaciones.

Se enriquecen recomendaciones y limitaciones bilingües en 41 entidades. Los umbrales numéricos no cambian. Mobitz II requiere confirmar estabilidad de PP, que la frecuencia auricular agregada no acredita. La pérdida gradual de delta no equivale a desaparición abrupta de preexcitación; una prueba de ejercicio aparentemente de bajo riesgo no excluye por sí sola conducción rápida de una vía accesoria. El ECG aislado tampoco decide anticoagulación, cardioversión o etiología anatómica.

Se corrige la colisión bibliográfica de Smith 2012: PMID 22520989 (infarto anterior sutil) y PMID 22939607 (Sgarbossa modificado). La recuperación de esta identidad ya existente explica una referencia adicional respecto a sumar únicamente las 24 nuevas.

Fuentes integra búsqueda, filtros por consulta y descarga de clinical-literature.json. Diagnóstico, resultado compartido y PDF conservan fecha, nivel, población y localizador de las fuentes pertinentes. La biblioteca se genera desde los cinco archivos KB; la compilación rechaza referencias ausentes o identificadores incompatibles.

Los manifiestos públicos de evidence/ contienen bibliografía y síntesis originales, sin textos completos de terceros ni datos de pacientes. Los artefactos de investigación permanecen fuera de Git.

Esta es una revisión narrativa focalizada, no una revisión sistemática, entrenamiento de modelos ni validación clínica. No se activan coeficientes experimentales ni probabilidades sin calibrar. Los criterios que requieren datos no medidos conservan su estado no evaluable.

Verificación: 219 pruebas JavaScript aprobadas, compilación TypeScript/Vite, 25 pruebas del servicio y siete casos mediante el worker compilado con Pyodide 0.27.7. Se generaron siete informes PDF; el caso de desarrollo 218 conserva el patrón WPW. Son regresiones técnicas, no estimaciones de rendimiento clínico. La interacción en Safari móvil no se verificó en esta entrega.
