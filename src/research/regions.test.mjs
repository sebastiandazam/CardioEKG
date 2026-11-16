import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictingRegions,significantOverlaps,cropsOverlap } from './regions.ts';
import {moveCrop} from './crop.ts';
import {analyzeSheet} from './sheet.ts';
test('moving a box can overlap a neighboring region while preserving its size and image bounds',()=>{
 const source={left:0,right:20,top:10,bottom:30},other={left:25,right:50,top:10,bottom:30};
 const next=moveCrop(source,15,0);
 assert.equal(next.right-next.left,20);assert.ok(cropsOverlap(next,other));assert.equal(next.left,15);
 assert.deepEqual(significantOverlaps({I:source,II:{left:19,right:39,top:10,bottom:30}}),[]);
 assert.equal(significantOverlaps({I:source,II:source}).length,1);
});
test('preselection remains disjoint and does not invent a rhythm strip when only three rows exist',()=>{
 for(const ys of [[240,350,460],[210,300,390,480]]){
  const width=600,height=600,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(const y of ys)for(let x=35;x<570;x++)data.fill(20,(y*width+x)*4,(y*width+x)*4+3);
  const detection=analyzeSheet(data,width,height,'4x3');
  const boxes={...detection.crops};if(!detection.rhythmDetected)delete boxes['II-long'];
  assert.equal(detection.rhythmDetected,ys.length===4);assert.deepEqual(conflictingRegions(boxes),[]);
 }
});
test('fallback row boundaries cannot overlap even if ink is concentrated near adjacent edges',()=>{
 const w=400,h=300,data=new Uint8ClampedArray(w*h*4).fill(255);
 for(const y of [108,109,110,183,184])for(let x=40;x<85;x++)data.fill(10,(y*w+x)*4,(y*w+x)*4+3);
 const {crops}=analyzeSheet(data,w,h,'4x3');delete crops['II-long'];
 assert.deepEqual(conflictingRegions(crops),[]);
});
