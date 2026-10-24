// 可复现随机数（用于对局回放与测试）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  if (seed === undefined || seed === null) seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  const r = mulberry32(seed);
  return {
    seed,
    next: r,
    int(n) { return Math.floor(r() * n); },
    pick(arr) { return arr[Math.floor(r() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
