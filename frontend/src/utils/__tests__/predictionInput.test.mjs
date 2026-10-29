import test from'node:test';import assert from'node:assert/strict';import{parseCsv}from'../csv.ts';import{predictionRows}from'../predictionInput.ts';
test('prediction CSV maps trimmed header names in training order without changing values',()=>{const doc=parseCsv('unused, y , x\nlabel,60,-15\nother,65,30');assert.deepEqual(predictionRows(doc,['x','y']),[['-15','60'],['30','65']]);});
test('prediction CSV rejects missing or ambiguous input headers and header-only files',()=>{for(const source of ['x,z\n1,2','x,x,y\n1,2,3','x,y'])assert.throws(()=>predictionRows(parseCsv(source),['x','y']));});
