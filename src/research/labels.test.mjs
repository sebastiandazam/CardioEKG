import test from 'node:test';
import assert from 'node:assert/strict';
import { readLeadLabels, applyLeadLabels } from './labels.ts';
import { suggestSheetCrops } from './sheet.ts';
const tsv = words => 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'+words.map(([text,confidence,x=10,y=10])=>`5\t1\t1\t1\t1\t1\t${x}\t${y}\t20\t10\t${confidence}\t${text}`).join('\n');
test('OCR accepts exact lead names above confidence threshold and rejects header/digit guesses',()=>{
  const hits=readLeadLabels(tsv([['aVR',90],['V1',85],['I',30],['1',99],['AVF',88],['Patient',99]]),1000,500);
  assert.deepEqual(hits.map(hit=>hit.lead),['aVR','V1','aVF']);
  assert.equal(hits[0].left,1);
  assert.deepEqual(readLeadLabels('bad',100,100),[]);
});
test('printed labels can swap slot assignments without duplicating crops and all fallbacks remain explicit',()=>{
  const base=suggestSheetCrops(new Uint8ClampedArray(400*300*4).fill(255),400,300,'4x3');
  const hit=(lead,slot)=>({lead,confidence:95,left:base[slot].left,top:(base[slot].top+base[slot].bottom)/2,right:base[slot].left+2,bottom:(base[slot].top+base[slot].bottom)/2+1});
  const result=applyLeadLabels(base,[hit('V1','I'),hit('I','V1')]);
  assert.deepEqual(result.crops.V1,base.I);assert.deepEqual(result.crops.I,base.V1);
  assert.equal(new Set(Object.values(result.crops).map(box=>JSON.stringify(box))).size,13);
  assert.equal(result.evidence.V1.method,'ocr');assert.equal(result.evidence.II,undefined);
});
test('a single repeated II label cannot confirm both short and long II',()=>{
  const base=suggestSheetCrops(new Uint8ClampedArray(400*300*4).fill(255),400,300,'4x3');
  const result=applyLeadLabels(base,[{lead:'II',confidence:99,left:5.5,right:7,top:70,bottom:72}]);
  assert.ok(Object.keys(result.evidence).length<=1);
});
import { readPrintedCalibration } from './labels.ts';
test('letter-spaced printed labels such as "aV R" and "V 1" are joined on the same line', () => {
  const rows = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' + [
    ['aV', 70, 100], ['R', 70, 128], ['V', 64, 400], ['1', 64, 415], ['av', 27, 700], ['F', 30, 726], ['Case', 96, 900],
  ].map(([text, conf, x]) => `5\t1\t1\t1\t1\t1\t${x}\t10\t${text.length * 12}\t20\t${conf}\t${text}`).join('\n');
  assert.deepEqual(readLeadLabels(rows, 1000, 500).map(h => h.lead), ['aVR', 'V1', 'aVF']);
});
test('printed speed and gain are read even when OCR damages the units', () => {
  assert.deepEqual(readPrintedCalibration('ECG Wave-Maven 25mm Aec, 10mm AY'), { speed: 25, gain: 10 });
  assert.deepEqual(readPrintedCalibration('25 mm/s 10 mm/mV'), { speed: 25, gain: 10 });
  assert.deepEqual(readPrintedCalibration('50 mm/sec 5 mm/mV'), { speed: 50, gain: 5 });
  assert.deepEqual(readPrintedCalibration('25mm/5 10mm/rnV'), { speed: 25, gain: 10 });
  assert.deepEqual(readPrintedCalibration('Patient 125 mm'), {});
});

test('recovers common OCR glyph confusions for precordial and limb leads while deduplicating overlaps', () => {
  const rows = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' + [
    ['ll', 88, 100, 200], ['aV', 75, 300, 100], ['l', 75, 326, 100], ['Vl', 80, 500, 100], ['V1', 62, 502, 100], ['Vs', 85, 700, 200],
  ].map(([text, conf, x, y]) => `5\t1\t1\t1\t1\t1\t${x}\t${y}\t20\t18\t${conf}\t${text}`).join('\n');
  const hits = readLeadLabels(rows, 1000, 500);
  assert.deepEqual(hits.map(h => h.lead).sort(), ['II', 'V1', 'V5', 'aVL']);
});
