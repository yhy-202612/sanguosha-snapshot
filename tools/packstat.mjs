const {GENERALS,PACK_CN}=await import('../src/data/generals.js');
await import('../src/skills/index.js');
const byPack={};
for(const g of GENERALS){ (byPack[g.pack]=byPack[g.pack]||[]).push(g); }
console.log('总武将',GENERALS.length,'包数',Object.keys(byPack).length);
for(const [k,v] of Object.entries(byPack).sort((a,b)=>b[1].length-a[1].length))
  console.log(String((PACK_CN[k]||k)).padEnd(20),k.padEnd(14),v.length);
