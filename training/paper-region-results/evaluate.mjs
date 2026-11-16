/** Local QA only: reads ignored inputs; never embeds user images in outputs. */
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {analyzeSheet}=await import(pathToFileURL(process.argv[2]).href);
const manifest=JSON.parse(readFileSync('data/paper-region/manifest.json','utf8'));
const report=manifest.map(f=>{
 const result=analyzeSheet(new Uint8ClampedArray(readFileSync(f.file)),f.width,f.height,'4x3');
 const paper=f.paper??{left:0,right:100,top:393/924*100,bottom:740/924*100};
 const leadBoxes=Object.entries(result.crops).filter(([lead])=>lead!=='II-long');
 const expected=f.expected_trace_rows??[437,523,609,694];
 const rowErrors=['I','II','III','II-long'].slice(0,expected.length).map((lead,i)=>({lead,center_error_pixels:Math.abs((result.crops[lead].top+result.crops[lead].bottom)/200*f.height-expected[i]),expected_baseline_inside:result.crops[lead].top/100*f.height<=expected[i]&&result.crops[lead].bottom/100*f.height>=expected[i]}));
 const inside=leadBoxes.filter(([,b])=>b.left>=paper.left-.5&&b.right<=paper.right+.5&&b.top>=paper.top-.5&&b.bottom<=paper.bottom+.5);
 const centersOnPaper=leadBoxes.filter(([,b])=>(b.top+b.bottom)/2>=paper.top&&(b.top+b.bottom)/2<=paper.bottom);
 const {crops:_,...metadata}=result;
 return {detection_metadata:metadata,name:f.name,input_dimensions:[f.width,f.height],expected_paper_percent:paper,expected_trace_rows_pixels:f.expected_trace_rows??[437,523,609,694],rhythm_detected:result.rhythmDetected,detected_paper:result.paperBounds??result.paper??null,trace_evidence:result.rowsDetected??result.traceDetected??result.tracesDetected??null,row_alignment:rowErrors,lead_boxes_wholly_on_paper:inside.length,lead_centers_on_paper:centersOnPaper.length,crops:result.crops};
});
writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({crops,...r})=>r),null,2));
