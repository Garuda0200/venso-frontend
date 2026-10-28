import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';

const paths=[
 'src/pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments/PassengerDocuments.tsx',
 'src/pages/Ventas/VouchersVenta/components/Steps/PassengerDocuments/PassengerIdentityBatch.tsx',
 'src/pages/Ventas/VouchersVenta/components/VoucherModal/VoucherModal.tsx',
 'src/services/voucherDocumentService.ts',
];
test('pantallas y servicio de documentos no registran identidad, archivos, URLs ni errores completos',()=>{
 let calls=0;
 for(const path of paths){
  const tree=ts.createSourceFile(path,readFileSync(resolve(path),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=node=>{
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(tree)==='console'){
    calls++;
    assert.ok(node.arguments.length>0&&node.arguments.every(arg=>ts.isStringLiteral(arg)),path+': los logs deben omitir objetos personales');
   }
   ts.forEachChild(node,visit);
  };visit(tree);
 }
 assert.ok(calls>=8);
});
test('el borrado real rechaza evidencia privada antes de invocar cualquier dependencia',async()=>{
 const path=paths[0],source=readFileSync(resolve(path),'utf8');
 const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback;
 const visit=node=>{
  if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='handleDeleteDocument') callback=node.initializer.arguments[0];
  ts.forEachChild(node,visit);
 };visit(tree);assert.ok(callback);
 const printed=ts.createPrinter().printNode(ts.EmitHint.Expression,callback,tree);
 const js=ts.transpileModule('const remove='+printed+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const document={id:1,documentAssetId:'synthetic-private'};
 const map=new Map([['adult-0',{passports:[document]}]]);let message='';
 const remove=new Function('selectedPassengerId','documentsMapRef','activeCategory','showStatusMessage',js+';return remove;')(
  'adult-0',{current:map},'passports',(_,text)=>{message=text});
 await remove(1);
 assert.match(message,/retención documental/);
 assert.equal(map.get('adult-0').passports[0],document);
});
