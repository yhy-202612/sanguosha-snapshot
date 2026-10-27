// 「月」系统（月系列武将共用）
// ------------------------------------------------------------------
// 玩家设计稿规则（2026-10-25 玩家补充）：
//   月亮图标 ☽：x 代指「月标记上限为 x」（写在武将名右侧）。
//   初辉技：☽ 不满时，可以于出牌阶段使用，发动后耗尽 ☽。
//   满辉技：☽ 集满（达到上限）时，立即使用，耗尽 ☽。
//   祈月：于下一次获得 ☽ 前可用（一次性窗口）。
// 记账口径：月标记统一用 p.marks.yue（0..moonMax），上限来自武将数据的 moonMax。
// 增幅：p.marks.zengfu 为百分点（【新征程】每次 +50 → 1.5 倍），见 moonMult()。

export function moonMaxOf(p) {
  const v = p?.moonMax;
  return typeof v === 'number' && v > 0 ? v : 10;
}

// 增加 n 个月标记（可为负），返回实际变化量
export function addMoon(p, n = 1) {
  if (!p) return 0;
  const cap = moonMaxOf(p);
  const before = p.marks.yue || 0;
  p.marks.yue = Math.max(0, Math.min(cap, before + n));
  const delta = p.marks.yue - before;
  // 祈月：「于下一次获得 ☽ 前可用」——只要真的获得了「☽」，可用窗口即重新打开
  if (delta > 0 && p.flags) p.flags.qiyueUsed = false;
  return delta;
}

// ---------------- 祈月 ----------------
// 玩家设计稿：祈月技「于下一次获得 ☽ 前可用」。
// 落地口径：发动一次后置 qiyueUsed（该窗口用完），待下一次获得「☽」时自动重置（见 addMoon）。
export function qiyueReady(p) { return !p?.flags?.qiyueUsed; }

export function markQiyue(p) { if (p?.flags) p.flags.qiyueUsed = true; }

export function moonIsFull(p) { return (p?.marks?.yue || 0) >= moonMaxOf(p); }

// 耗尽：清空并返回清空前的数量
export function moonClear(p) {
  if (!p) return 0;
  const n = p.marks.yue || 0;
  p.marks.yue = 0;
  return n;
}

// 【新征程】增幅倍率：1 + zengfu/100
export function moonMult(p) { return 1 + ((p?.marks?.zengfu || 0) / 100); }

// 【新征程】增幅作用于「获得 ☽ 的个数」：base × 倍率后向下取整，至少 1 个
export function moonGainN(p, base = 1) {
  const n = Math.floor(base * moonMult(p));
  return Math.max(base > 0 ? 1 : 0, n);
}

export function moonText(p) { return `${p.marks.yue || 0}/${moonMaxOf(p)}`; }
