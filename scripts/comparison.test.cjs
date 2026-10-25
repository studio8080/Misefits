const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);return html.slice(start,html.indexOf('\n}',start)+2);}
function harness(){
  const project={active:0,sheets:[{name:'Original',image:'data:image/png;base64,fixture',mmPerPixel:10,calibrated:true,objects:[{data:{key:'table4'}}],_meas:[{x1:0,y1:0,x2:90,y2:0}]}]};
  const ctx=vm.createContext({project,canvas:null,sheetLoading:false,calMode:false,measMode:false,traceMode:false,SAMPLE_MMPP:6.35,SHAPE_LABEL:{rect:'Rectangle'},activeSheet:()=>project.sheets[project.active],t:s=>s,showHint(){},autosave(){},syncActiveObjects(){},
    addSheet:sheet=>project.sheets.push(sheet),switchSheet:index=>{project.active=index;}});
  vm.runInContext(['sanitizeMeasures','sanitizeVerts','sanitizeSheet','serializeProject','createComparisonPair','comparisonPairs','comparisonLines'].map(fn).join('\n'),ctx);return ctx;
}
test('A/B copies keep original and clone object/measurement arrays',()=>{
  const ctx=harness(),original=JSON.stringify(ctx.project.sheets[0]);ctx.createComparisonPair();
  assert.equal(ctx.project.sheets.length,3);assert.equal(ctx.project.active,2);
  const [base,a,b]=ctx.project.sheets;assert.equal(a.image,b.image);assert.notEqual(a.objects,b.objects);
  b.objects[0].data.key='table2';b._meas[0].x2=120;
  assert.equal(a.objects[0].data.key,'table4');assert.equal(a._meas[0].x2,90);assert.equal(JSON.stringify(base),original);
});
test('additive JSON fields survive roundtrip and older JSON remains readable',()=>{
  const ctx=harness();ctx.createComparisonPair();const saved=ctx.serializeProject();
  const restored=saved.sheets.map(ctx.sanitizeSheet);assert.equal(restored[2].comparisonVariant,'B');assert.equal(restored[1]._meas[0].x2,90);
  assert.equal(ctx.sanitizeSheet({image:'data:image/png;base64,old',objects:[]})._meas.length,0);
});
test('pairs require both variants from the same drawing',()=>{
  const ctx=harness();ctx.createComparisonPair();assert.equal(ctx.comparisonPairs().length,1);
  ctx.project.sheets[2].image='data:image/png;base64,different';assert.equal(ctx.comparisonPairs().length,0);
});
test('measurement import only accepts finite numeric endpoints',()=>{
  const ctx=harness();assert.equal(ctx.sanitizeMeasures([{x1:0,y1:0,x2:90,y2:0},{x1:0,y1:0,x2:'90',y2:0},{x1:0,y1:0,x2:Infinity,y2:0}]).length,1);
});
