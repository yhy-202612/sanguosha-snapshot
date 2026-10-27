const {GENERALS,PACK_CN}=await import('../src/data/generals.js');
const by={};
for(const g of GENERALS){(by[g.pack]=by[g.pack]||[]).push(g.name);}
const out=[];
for(const [k,v] of Object.entries(by)) out.push(`## ${PACK_CN[k]||k} (${k}) — ${v.length} 将\n${v.join('、')}`);
console.log(out.join('\n\n'));
