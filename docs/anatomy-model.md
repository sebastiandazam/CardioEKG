# Anatomía de CardioEKG: fuentes, alcance y animación

## Dos atlas separados

El visor abre por defecto **Heart Atlas / BodyParts3D**, con referencias anatómicas visibles. Como alternativa conserva el corazón masculino de **Human Reference Atlas / HuBMAP v1.2**, derivado de Visible Human de la National Library of Medicine. El archivo tiene 14 mallas anatómicas: ambas aurículas, los dos ventrículos, un tabique interventricular con geometría propia (4.039 vértices y 8.074 triángulos), cuatro válvulas y cinco grupos papilares. Conservamos todos los triángulos, proporciones y posiciones relativas. La representación es un órgano de referencia, no el corazón del usuario ni una anatomía aprobada para planificación clínica.

Archivo original fijado: `https://raw.githubusercontent.com/hubmapconsortium/ccf-releases/b036a91aaf7234f462b1249d4a5f4fb0e982f412/v1.2/models/VH_M_Heart.glb`. Licencia CC BY 4.0 declarada por la [biblioteca oficial](https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html). El archivo y la atribución se sirven localmente en `/anatomy/heart-hra.glb` y `/anatomy/LICENSE-HRA.txt`.

El atlas principal **Heart Atlas / BodyParts3D** se distribuye, CC BY-SA 4.0, con vasos, coronarias, válvulas y papilares. Sus ventrículos son superficies de las cavidades y sus tabiques son anclajes sin geometría independiente. Esta limitación se explica en el visor. Los dos órganos proceden de fuentes distintas y **no se superponen ni se mezclan sus mallas anatómicas**. Cambiar de atlas sustituye el conjunto completo. No se ha reutilizado contenido de BioDigital ni un widget sujeto a una licencia distinta.

Se inspeccionó también el archivo original de Z-Anatomy. Sus objetos denominados “Interatrial septum.j” son marcadores de dos vértices, sin caras; no se presentaron como una reconstrucción de tabiques.

## Materiales y cortes

El material distingue miocardio, valvas y conducción con colores didácticos y sombreado suave. No se añade una textura de ruido que pueda confundirse con superficie anatómica. Las proporciones se preservan mediante una única escala uniforme. El pivote se centra en las estructuras cardíacas, en lugar de desplazarse con la cava inferior larga.

Los controles permiten seleccionar una estructura, mostrar su etiqueta y aislarla, regular la transparencia del contexto, y aplicar un corte frontal, sagital o transversal con posición y lado visibles ajustables. Los cortes se calculan en coordenadas del modelo; descartan realmente la geometría situada fuera del semiespacio visible. Los bordes de corte quedan abiertos: no se inventan superficies para simular tejido. Aislar una estructura elimina el resto del dibujo.

## Conducción

En Heart Atlas se utilizan las rutas esquemáticas publicadas en su `conduction.yaml`, de la misma versión fijada que la anatomía. Los vértices de cada rama reciben una coordenada de recorrido de 0 a 1 calculada por distancia al tramo más cercano y longitud acumulada de su ruta; la señal avanza por la ruta, no por una franja vertical arbitraria. La referencia de colocación declarada por el atlas es Anderson et al., *The anatomy of the cardiac conduction system*, Clin Anat. 2009;22:99–113, DOI `10.1002/ca.20700`.

HRA no segmenta tejido conductor. `src/anatomy/hraConduction.ts` contiene puntos docentes definidos en las coordenadas originales del propio HRA: unión superior de la aurícula derecha para el nodo sinusal, región septal AV próxima al anillo tricuspídeo, cresta septal para His, descenso por ambos lados del tabique y abanicos hacia las paredes ventriculares. Las rutas, nodos y una vía accesoria hipotética se dibujan aparte y se identifican expresamente como esquemáticos. No son mallas anatómicas importadas de otra persona ni un cálculo electrofisiológico validado.

Se representan el paso sinusal auricular, la pausa AV, His, ramas y Purkinje. En bloqueo de rama se señala la rama afectada y se retrasa la activación del lado correspondiente. La FA muestra activación auricular desorganizada sin activar el nodo sinusal como ritmo organizado. Los patrones docentes explícitos de bloqueo AV y preexcitación pueden modificar el ciclo mediante el tercer argumento de `teachingCycle`; esto no cambia ni crea el diagnóstico del ECG. El bloqueo AV de segundo grado docente muestra una conducción 2:1 y no pretende representar todas sus variantes; el tercer grado muestra un escape ventricular independiente esquemático de 40/min. La vía accesoria es una localización hipotética ilustrativa, nunca deducida de la imagen.

No se altera ni se contrae la geometría para aparentar mayor realismo. La animación corresponde a activación eléctrica docente, no a una simulación mecánica del bombeo. La extracción de P/QRS/T, si existe, pertenece al análisis del ECG; el reloj docente no fabrica marcadores sobre un trazado cargado.

## Verificación

Las pruebas comprueban la integridad de ambos GLB, los índices y normales finitos, la escala uniforme, la existencia real del tabique HRA, el recorrido de las rutas, los planos de corte y la lógica de activación. Se prueba el procesamiento numérico sin navegador. La inspección visual interactiva en Safari/WebGL queda pendiente si no hay una sesión de navegador disponible; no se presenta una compilación correcta como prueba visual.
