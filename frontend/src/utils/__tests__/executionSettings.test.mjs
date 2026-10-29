import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingForm} from '../../config/modelCatalog.ts';
import {buildTrainingPlan} from '../trainingConfig.ts';

test('GPU is opt-in; fresh training forms always select browser CPU',()=>{
 for(const task of ['classification','regression']){
  const form=createTrainingForm(task);
  assert.equal(form.shared.device,'cpu');assert.equal(form.shared.environment,'browser');
 }
});

test('GPU selection never leaks into a server execution plan',()=>{
 const form=createTrainingForm();form.shared.environment='server';form.shared.device='gpu';form.shared.stratify=false;form.selected=['tree'];
 const snapshot={fileName:'test.csv',csv:'',data:{inputColumns:['x'],outputColumns:['y'],inputs:Array.from({length:30},(_,i)=>[String(i)]),outputs:Array.from({length:30},(_,i)=>[String(i%2)])},inputPreprocessing:[{columnIndex:0,name:'x',config:{kind:'number',scaling:'none'}}],labelPreprocessing:[{columnIndex:1,name:'y',task:'classification',encoding:'label_encoder',restoreOriginalLabel:true,problemType:'binary'}]};
 assert.equal(buildTrainingPlan(snapshot,form).execution.device,'cpu');
 form.shared.environment='browser';assert.equal(buildTrainingPlan(snapshot,form).execution.device,'gpu');
});
