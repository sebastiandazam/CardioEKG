# Wave-Maven: colección docente inicial y procedencia

La autorización de uso fue comunicada por el propietario del proyecto en la conversación. Se registra como autorización reportada por el propietario, sin inventar un documento o una licencia CC/MIT. Se mantienen el copyright y la atribución originales.

`import_cases.py` sigue el acceso público normal de Wave-Maven, con los campos opcionales de identidad y encuesta vacíos. Importa el catálogo oficial y, por defecto, seis casos: 1, 2, 3, 4, 5 y 15. Descarga los PDF originales, renderiza la primera página a PNG de 2800 px y conserva hashes, diagnóstico de la fuente y procedencia en `import-manifest.json`. Solo admite hasta doce identificadores explícitos por ejecución para evitar descargas masivas accidentales.

```sh
python training/wave-maven/import_cases.py --case-ids 1,2,3,4,5,15
```

Requiere `pdftoppm` de Poppler. Los archivos se guardan en `public/wave-maven/`. El catálogo importado contiene 547 referencias; solo seis ECG están incluidos localmente. Estos números son importación de recursos, no cantidad de ECG de un entrenamiento ejecutado.

Los grupos de desarrollo y reserva son **casos**, no pacientes verificados. La base no entrega aquí identidad de pacientes ni límites expertos P/QRS/T. No se pueden afirmar separación de pacientes, errores de intervalos, exactitud del eje ni validación clínica a partir de estas etiquetas. El diagnóstico del caso puede depender de antecedentes y pruebas ajenas al ECG; no es automáticamente una etiqueta de morfología del trazado. Las variantes fotográficas de una misma imagen deben conservar el grupo del caso original.

No se entrenaron modelos ni se alteraron sus pesos en esta importación. Los futuros experimentos deberán fijar objetivos, revisar anotaciones, excluir duplicados y registrar particiones antes de ajustar, sin usar los casos reservados para corregir el modelo.
