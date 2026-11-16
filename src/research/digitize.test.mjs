import assert from 'node:assert/strict';
import test from 'node:test';
import { digitize, estimateRate, resample, estimatePaperGrid, pixelTraceDraft } from './digitize.ts';
import { readApprovedModel } from './protocol.ts';
import { validatePhoto } from './photo.ts';
import { ResearchError, researchMessage } from './locale.ts';

const calibration = { speed: 25, gain: 10, widthMm: null, heightMm: null };

function photo({ blank = false, grid = true, tall = false, clipped = false, label = false } = {}) {
  const width = 1000;
  const height = 180;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const triangle = (phase, center, extent) => Math.max(0, 1 - Math.abs(phase - center) / extent);
  const points = Array.from({ length: width }, (_, x) => {
    const phase = x % 100;
    if(tall) return Math.round(90-85*triangle(phase,38,2)+85*triangle(phase,43,2));
    if(clipped) return Math.max(0,Math.round(90-130*triangle(phase,38,7)));
    return Math.round(90 - 8 * triangle(phase, 18, 7) + 9 * triangle(phase, 34, 3)
      - 40 * triangle(phase, 38, 4) + 13 * triangle(phase, 44, 4) - 12 * triangle(phase, 65, 12));
  });
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let color = [255, 250, 247, 255];
      if (grid && (x % 4 === 0 || y % 4 === 0)) color = [250, 202, 202, 255];
      if (grid && (x % 20 === 0 || y % 20 === 0)) color = [250, 159, 159, 255];
      const previousPoint = points[Math.max(0, x - 1)];
      if (!blank && y >= Math.min(points[x], previousPoint) - 1
        && y <= Math.max(points[x], previousPoint) + 1) color = [27, 24, 24, 255];
      rgba.set(color, (y * width + x) * 4);
    }
  }
  if(label) {
    // Rasterized "II" label and a short printed stroke near the top edge.
    for(let y=1;y<17;y++)for(let x=4;x<24;x++)if(x<7||(x>=12&&x<15)||y<3)rgba.set([20,20,20,255],(y*width+x)*4);
  }
  return { rgba, width, height, points };
}

test('recovers grid calibration and repeated QRS from an RGB fixture', () => {
  const { rgba, width, height, points } = photo();
  const trace = digitize(rgba, width, height, calibration);
  assert.ok(Math.abs(trace.pxPerMmX - 4) < 0.1, trace.pxPerMmX);
  assert.ok(Math.abs(trace.pxPerMmY - 4) < 0.1, trace.pxPerMmY);
  assert.ok(Math.abs(trace.seconds - 10) < 0.2, trace.seconds);
  assert.equal(trace.gridUnitEvidence, 'major-minor');
  assert.equal(trace.warning, null);
  const absoluteError = trace.points.reduce((sum, y, x) => sum + Math.abs(y - points[x]), 0) / width;
  assert.ok(absoluteError < 3, absoluteError);
  assert.ok(Math.abs(Math.max(...trace.mv) - 1) < 0.2, JSON.stringify({ max: Math.max(...trace.mv), actual: trace.points.slice(30, 50), expected: points.slice(30, 50) }));
  assert.ok(Math.abs(estimateRate(trace) - 60) <= 1);
});

test('warns and abstains for a blank calibrated strip', () => {
  const { rgba, width, height } = photo({ blank: true });
  const trace = digitize(rgba, width, height, calibration);
  assert.ok(trace.warning);
  assert.equal(estimateRate(trace), null);
});

test('blocks a visibly interrupted tracing even when most columns are present', () => {
  const { rgba, width, height } = photo();
  for (let y = 0; y < height; y++) {
    for (let x = 350; x < 420; x++) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
  }
  const trace = digitize(rgba, width, height, calibration);
  assert.match(trace.warning, /cortes/);
  assert.equal(trace.warningCode, 'interruptedTrace');
  assert.match(researchMessage(trace.warningCode, 'en'), /tracing has gaps/);
  assert.equal(estimateRate(trace), null);
});

test('accepts explicit calibration and rejects an image with no reliable grid', () => {
  const { rgba, width, height } = photo({ grid: false });
  assert.throws(() => digitize(rgba, width, height, calibration), error =>
    error instanceof ResearchError && error.code === 'gridScale'
    && /calibrar la cuadrícula/.test(error.message)
    && /grid could not be calibrated/.test(researchMessage(error.code, 'en')));
  const trace = digitize(rgba, width, height, { ...calibration, widthMm: 250, heightMm: 45 });
  assert.equal(trace.calibration, 'manual');
  assert.equal(trace.seconds, 10);
  assert.equal(trace.warning, null);
});

test('preserves scale when resampling and abstains on a short strip', () => {
  assert.deepEqual(Array.from(resample({ mv: [0, 2, 4, 6], seconds: 1, quality: 1 }, 2)), [0, 4]);
  const { rgba, width, height } = photo();
  const trace = digitize(rgba, width, height, { ...calibration, speed: 50 });
  assert.equal(estimateRate({ ...trace, seconds: 2.5 }), null);
});

test('rejects an image spoofing the MIME type', async () => {
  const svg = new File(['<svg onload="test()"/>'], 'fake.jpg', { type: 'image/jpeg' });
  await assert.rejects(validatePhoto(svg), /JPG, PNG o WebP/);
});

test('permits only local, identified approved model assets', () => {
  const band = { lower: 0.15, upper: 0.8 };
  const config = {
    runtimeModule: '/models/ort.min.mjs',
    wasmDirectory: '/models/wasm/',
    modelUrl: '/models/classifier.onnx',
    sha256: '0'.repeat(64),
    decisionBands: { sinus: band, af: band, rbbb: band, lbbb: { lower: -1, upper: 2 } },
  };
  assert.deepEqual(readApprovedModel(JSON.stringify(config)), config);
  assert.equal(readApprovedModel(JSON.stringify({ ...config, modelUrl: 'https://elsewhere.test/a' })), undefined);
  assert.equal(readApprovedModel(JSON.stringify({ ...config, wasmDirectory: '/models/../a' })), undefined);
  assert.equal(readApprovedModel(JSON.stringify({ ...config, decisionBands: {} })), undefined);
});

test('recovers a calibrated trace under uneven photographic illumination without accepting blank paper', () => {
  for (const blank of [false, true]) {
    const { rgba, width, height, points } = photo({ blank });
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const brightness = .52 + .46 * x / (width - 1);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] *= brightness;
    }
    const trace = digitize(rgba, width, height, calibration);
    if (blank) assert.ok(trace.warning);
    else {
      assert.equal(trace.warning, null);
      assert.ok(Math.abs(trace.pxPerMmX - 4) < .15);
      assert.ok(trace.points.reduce((sum, y, x) => sum + Math.abs(y - points[x]), 0) / width < 3);
    }
  }
});

function fractionalGrid({ pitchX = 6.4, pitchY = pitchX, shiftX = .35, shiftY = .7, minor = 8, moire = 0, width = 1600, height = 128 } = {}) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const distance = (coordinate, pitch, shift) => Math.abs(coordinate - shift - Math.round((coordinate - shift) / pitch) * pitch);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const fine = Math.max(0, 1 - Math.min(distance(x, pitchX, shiftX), distance(y, pitchY, shiftY)) / .9);
    const major = Math.max(0, 1 - Math.min(distance(x, pitchX * 5, shiftX), distance(y, pitchY * 5, shiftY)) / 1.15);
    let value = Math.round(255 - minor * fine - 85 * major - moire * ((x % 2) + (y % 2)));
    const phase = x % 175, center = 66 - 28 * Math.max(0, 1 - Math.abs(phase - 24) / 6) + 6 * Math.sin(x / 18);
    if (Math.abs(y - center) < 1.2) value = 30;
    rgba.set([value, value, value, 255], (y * width + x) * 4);
  }
  return { rgba, width, height };
}

test('fractional faint gray minor grid keeps long-strip scale across crop alignments', () => {
  for (const shift of [.1, .55, 1.2, 3.3]) {
    const { rgba, width, height } = fractionalGrid({ shiftX: shift, shiftY: shift + .3 });
    const trace = digitize(rgba, width, height, calibration);
    assert.ok(Math.abs(trace.pxPerMmX - 6.4) < .2, `${shift}: x=${trace.pxPerMmX}`);
    assert.ok(Math.abs(trace.pxPerMmY - 6.4) < .2, `${shift}: y=${trace.pxPerMmY}`);
    assert.ok(Math.abs(trace.seconds - 10) < .32, `${shift}: duration=${trace.seconds}`);
    assert.equal(trace.gridUnitEvidence, 'major-minor');
  }
});

test('real anisotropic gray grid still requires rectification or manual calibration', () => {
  const { rgba, width, height } = fractionalGrid({ pitchX: 6.4, pitchY: 10 });
  assert.throws(() => digitize(rgba, width, height, calibration), error =>
    error instanceof ResearchError && error.code === 'unevenScale');
});


test('short lead crops preserve the fundamental rather than a major-grid harmonic', () => {
  for (const shift of [.1, .8, 2.7]) {
    const { rgba, width, height } = fractionalGrid({ pitchX: 4.8, shiftX: shift, shiftY: shift + .4, width: 300, height: 180 });
    const trace = digitize(rgba, width, height, calibration);
    assert.ok(Math.abs(trace.pxPerMmX - 4.8) < .18, `${shift}: x=${trace.pxPerMmX}`);
    assert.ok(Math.abs(trace.pxPerMmY - 4.8) < .18, `${shift}: y=${trace.pxPerMmY}`);
    assert.ok(Math.abs(trace.seconds - 2.5) < .1, trace.seconds);
    assert.equal(trace.gridUnitEvidence, 'major-minor');
  }
});

test('a faint minor grid and darker five-millimetre grid do not shorten a long strip fivefold', () => {
  const { rgba, width, height } = fractionalGrid({ pitchX: 4.8, width: 1200, height: 180 });
  const trace = digitize(rgba, width, height, calibration);
  assert.ok(Math.abs(trace.seconds - 10) < .2, trace.seconds);
  assert.ok(Math.abs(trace.pxPerMmX - 4.8) < .15, trace.pxPerMmX);
});


test('distinguishes periodic gray lines alone from observed major/minor millimetre hierarchy', () => {
  const { rgba, width, height } = fractionalGrid({ minor: 0, pitchX: 4.8, width: 1200, height: 220 });
  const trace = digitize(rgba, width, height, calibration);
  assert.equal(trace.gridUnitEvidence, 'periodic-only');
  const explicit = digitize(rgba, width, height, { ...calibration, widthMm: 250, heightMm: 45 });
  assert.equal(explicit.gridUnitEvidence, 'manual');
  const detailed = fractionalGrid({ pitchX: 4.8, width: 1200, height: 220 });
  assert.equal(digitize(detailed.rgba, detailed.width, detailed.height, calibration).gridUnitEvidence, 'major-minor');
});


test('verified original-paper grid is shared without assuming duration and pixel drafts have no physical units', () => {
  const fixture=fractionalGrid({pitchX:4.8,width:1200,height:220});
  const grid=estimatePaperGrid(fixture.rgba,fixture.width,fixture.height);
  assert.ok(grid);assert.ok(Math.abs(grid.pxPerMmX-4.8)<.15);assert.ok(Math.abs(grid.pxPerMmY-4.8)<.15);
  const unknown=fractionalGrid({minor:0,pitchX:4.8,width:1200,height:220});
  assert.equal(estimatePaperGrid(unknown.rgba,unknown.width,unknown.height),null);
  const warped=fractionalGrid({pitchX:4.8,pitchY:8,width:1200,height:220});
  assert.equal(estimatePaperGrid(warped.rgba,warped.width,warped.height),null);
  const draft=pixelTraceDraft(fixture.rgba,fixture.width,fixture.height);
  assert.equal(draft.points.length,fixture.width);assert.equal('seconds' in draft,false);assert.equal('mv' in draft,false);
});


test('scanner two-pixel texture does not replace the physical major/minor grid', () => {
  const fixture=fractionalGrid({pitchX:6.4,minor:8,moire:4,width:1600,height:180});
  const trace=digitize(fixture.rgba,fixture.width,fixture.height,calibration);
  assert.equal(trace.gridUnitEvidence,'major-minor');
  assert.ok(Math.abs(trace.pxPerMmX-6.4)<.2,trace.pxPerMmX);
  assert.ok(Math.abs(trace.pxPerMmY-6.4)<.2,trace.pxPerMmY);
  assert.ok(Math.abs(trace.seconds-10)<.3,trace.seconds);
});


test('verified paper reference remains automatic grid calibration while explicit dimensions remain manual', () => {
  const fixture=photo({grid:false});
  const dimensions={...calibration,widthMm:250,heightMm:45};
  const manual=digitize(fixture.rgba,fixture.width,fixture.height,dimensions);
  assert.equal(manual.calibration,'manual');assert.equal(manual.gridUnitEvidence,'manual');
  const shared=digitize(fixture.rgba,fixture.width,fixture.height,{...dimensions,source:'paper-grid'});
  assert.equal(shared.calibration,'grid');assert.equal(shared.gridUnitEvidence,'major-minor');
  assert.equal(shared.seconds,manual.seconds);assert.deepEqual(shared.mv,manual.mv);
});


test('preserves tall narrow connected QRS peaks near both borders, with peripheral printed labels', () => {
 for(const label of [false,true]) {
  const fixture=photo({tall:true,label});
  const trace=digitize(fixture.rgba,fixture.width,fixture.height,calibration);
  assert.equal(trace.warningCode,undefined,JSON.stringify({warning:trace.warningCode,quality:trace.quality}));
  assert.ok(trace.quality>.85,trace.quality);
  assert.ok(Math.min(...trace.points)<10,'positive peak retained: '+Math.min(...trace.points));
  assert.ok(Math.max(...trace.points)>170,'negative peak retained: '+Math.max(...trace.points));
  assert.ok(trace.points.reduce((sum,y,x)=>sum+Math.abs(y-fixture.points[x]),0)/fixture.width<3);
 }
});

test('still warns for waves visibly truncated at the actual crop boundary', () => {
 const fixture=photo({clipped:true,label:true});
 const trace=digitize(fixture.rgba,fixture.width,fixture.height,calibration);
 assert.equal(trace.warningCode,'clippedTrace');
 assert.equal(estimateRate(trace),null);
});
