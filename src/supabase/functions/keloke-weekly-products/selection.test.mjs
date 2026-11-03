import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectFive} from './selection.mjs';
const product=(id,sold)=>({external_id:id,title:`Producto ${id}`,price_clp:12000,sold_quantity:sold,product_url:`https://articulo.mercadolibre.cl/${id}`});
test('weekly shortlist keeps five unique products ranked by observed sales',()=>{
 const items=Array.from({length:12},(_,i)=>product(`MLC${i}`,i+1));
 const selected=selectFive([...items,items[11]]);
 assert.equal(selected.length,5);assert.equal(new Set(selected.map(x=>x.external_id)).size,5);assert.equal(selected[0].sold_quantity,12);assert.equal(selected[4].sold_quantity,8);
});
test('missing sales, invalid prices, category links without evidence and unsafe URLs are excluded',()=>{
 const selected=selectFive([product('ok',10),product('zero',0),{...product('badprice',50),price_clp:null},{...product('badurl',50),product_url:'javascript:alert(1)'},{...product('other',50),product_url:'https://mercadolibre.cl.evil.test/a'}]);
 assert.deepEqual(selected.map(x=>x.external_id),['ok']);
});
test('insufficient evidence produces fewer than five rather than inventing winners',()=>{
 assert.equal(selectFive([product('a',4)]).length,1);assert.deepEqual(selectFive([]),[]);
});
