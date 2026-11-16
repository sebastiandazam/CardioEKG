import type { Language } from '../locale';

function Example({ columns, rows, partial=false, language }: { columns:number; rows:number; partial?:boolean; language:Language }) {
  const names = partial ? [['II']] : columns===4 ? [['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']] : [['I','V1'],['II','V2'],['III','V3'],['aVR','V4'],['aVL','V5'],['aVF','V6']];
  const height=partial?105:rows===3?205:300;
  const rowHeight=(height-40)/rows;
  const cellWidth=350/columns;
  const pulse='M0 0h7l3 -3 3 3h6l2 4 3 -23 4 30 4 -11h7q4 -10 8 0h15';
  return <svg viewBox={`0 0 380 ${height}`} role="img" aria-label={language==='es' ? (partial?'Ejemplo de una tira de ritmo con una sola derivación':`Ejemplo simulado de 12 derivaciones en ${columns} columnas y ${rows} filas`) : (partial?'Example of a single-lead rhythm strip':`Simulated 12-lead ECG in ${columns} columns and ${rows} rows`)}>
    <defs><pattern id={`grid-${columns}-${rows}`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#ebc8c0" strokeWidth=".6"/></pattern></defs>
    <rect width="380" height={height} fill="#fffdf9"/><rect x="5" y="5" width="370" height={height-10} fill={`url(#grid-${columns}-${rows})`}/>
    {names.flatMap((row,r)=>row.map((name,c)=><g key={name} transform={`translate(${15+c*cellWidth} ${12+r*rowHeight})`}>
      <text x="0" y="10" fontSize="10" fontWeight="700" fill="#482d23">{name}</text>
      <svg x="0" y="13" width={cellWidth-5} height={rowHeight-15} viewBox="0 -28 95 70" preserveAspectRatio="none"><path d={pulse+'h8'} transform="translate(0 3)" fill="none" stroke="#2e2521" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>
    </g>))}
    <text x="15" y={height-10} fill="#513d34" fontSize="9">25 mm/s · 10 mm/mV</text>
  </svg>;
}

export function FormatExamples({ language,onChoose }: { language:Language; onChoose:(format:'twelve'|'partial')=>void }) {
  const es=language==='es';
  return <section className="intake-format-examples" aria-label={es?'Ejemplos del formato del ECG':'ECG format examples'}>
    <h2>{es?'Así se ve un registro apto':'What a suitable recording looks like'}</h2>
    <p>{es?'Ejemplos simulados para reconocer el formato; no son ECG de pacientes. Se admite una imagen, una página PDF o fotos de cada derivación del mismo registro.':'Simulated examples to identify the format; these are not patient ECGs. Use one image, one PDF page, or individual lead photos from the same recording.'}</p>
    <div className="intake-format-grid">{[{columns:4,rows:3},{columns:2,rows:6}].map(({columns,rows})=><button type="button" key={columns} onClick={()=>onChoose('twelve')}>
      <Example columns={columns} rows={rows} language={language}/>
      <strong>{es?'12 derivaciones':'12 leads'} · {columns} × {rows}</strong>
      <span>{es?'Apto por formato: deben verse las 12 etiquetas.':'Suitable format: all 12 labels must be visible.'}</span>
    </button>)}</div>
    <details><summary>{es?'¿Qué no basta para esta revisión?':'What is insufficient for this review?'}</summary>
      <div className="intake-partial-example"><Example columns={1} rows={1} partial language={language}/></div>
      <p>{es?'Una tira de II o un registro de reloj de una sola derivación no equivalen a un ECG de 12 derivaciones. Tampoco sirve una hoja con trazados cortados o etiquetas ilegibles.':'A lead II rhythm strip or a single-lead watch recording is not a 12-lead ECG. Cropped-off tracings or unreadable labels are also insufficient.'}</p>
      <button type="button" className="intake-back" onClick={()=>onChoose('partial')}>{es?'Tengo solo una tira o un ECG incompleto':'I only have a strip or incomplete ECG'}</button>
    </details>
    <ul><li>{es?'I, II, III, aVR, aVL, aVF y V1–V6 visibles y legibles.':'I, II, III, aVR, aVL, aVF and V1–V6 visible and legible.'}</li>
      <li>{es?'Velocidad y ganancia impresas, cuadrícula visible y trazados completos, nítidos y sin inclinación marcada.':'Printed speed and gain, a visible grid, and complete, sharp tracings without marked tilt.'}</li>
      <li>{es?'Sin nombres, documentos ni otros datos personales. La apariencia apta no garantiza una reconstrucción fiable.':'No names, identifiers or other personal information. A suitable appearance does not guarantee reliable reconstruction.'}</li></ul>
  </section>;
}
