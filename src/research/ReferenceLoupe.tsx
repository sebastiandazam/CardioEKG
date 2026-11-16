import type {Crop} from './digitize';
import {referenceCorners} from './reference';
import type {ReferenceCorner} from './reference';
export function ReferenceLoupe({url,box,width,height,corner,onCorner,es,floatingSide}:{floatingSide:'left'|'right'|null;url:string|null;box:Crop;width:number;height:number;corner:ReferenceCorner;onCorner:(corner:ReferenceCorner)=>void;es:boolean}) {
 const left=box.left*width/100,right=box.right*width/100,top=box.top*height/100,bottom=box.bottom*height/100;
 const x=corner.endsWith('left')?left:right,y=corner.startsWith('top')?top:bottom;
 const radius=Math.max(12,Math.min(60,width*.025)),stroke=radius*.025;
 const labels=es?['Superior izquierda','Superior derecha','Inferior izquierda','Inferior derecha']:['Top left','Top right','Bottom left','Bottom right'];
 return <div className="ecg-reference-loupe">
 <div className={`ecg-reference-loupe-view ${floatingSide?'is-floating at-'+floatingSide:''}`}>
 <svg viewBox={`${x-radius} ${y-radius} ${radius*2} ${radius*2}`} role="img" aria-label={(es?'Lupa de la esquina: ':'Corner magnifier: ')+labels[referenceCorners.indexOf(corner)]}>
  <rect x={x-radius} y={y-radius} width={radius*2} height={radius*2} fill="#fff9f2"/>
  {url&&<image href={url} x="0" y="0" width={width} height={height} preserveAspectRatio="none"/>}
  <rect x={left} y={top} width={right-left} height={bottom-top} fill="none" stroke="#056cbb" strokeWidth={stroke}/>
  {/* Open crosshair leaves the exact intersection visible. */}
  <path d={`M${x-radius*.5} ${y}H${x-radius*.12} M${x+radius*.12} ${y}H${x+radius*.5} M${x} ${y-radius*.5}V${y-radius*.12} M${x} ${y+radius*.12}V${y+radius*.5}`} fill="none" stroke="#083d6b" strokeWidth={stroke} strokeDasharray={`${stroke*2} ${stroke*2}`}/>
 </svg></div>
 <div><strong>{es?'Lupa de la esquina':'Corner magnifier'}</strong>
 <p>{es?'Alinea los dos bordes azules con las líneas del cuadrado grande. El centro de la lupa muestra la esquina seleccionada sin el control encima.':'Align both blue edges with the large grid square’s lines. The center of the magnifier shows the selected corner without its handle.'}</p>
 <div className="ecg-reference-corners" role="group" aria-label={es?'Esquina que muestra la lupa':'Corner shown in the magnifier'}>{referenceCorners.map((item,index)=><button type="button" key={item} aria-pressed={corner===item} onClick={()=>onCorner(item)}>{labels[index]}</button>)}</div>
 </div></div>;
}
