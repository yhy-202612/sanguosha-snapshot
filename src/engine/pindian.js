// M1 拼点机制：双方各弃置一张手牌，点数大的一方赢；点数相同视为发起方「没赢」。
// 供祝融【烈刃】、高顺【陷阵】、荀彧【驱虎】、太史慈【天义】等技能复用。
// 2026-10-26 扩展：新增 `pindian.pick` 事件（选牌窗口），技能可替换本方的拼点牌与有效点数
//               —— 目前用于秦宓【天辩】（改用牌堆顶一张，红桃点数视为 K）。
//               有效点数用 `d.num` 传递，比较与日志都按 d.num；无技能介入时行为与旧版完全一致。
import { cardLabel } from './cards.js';

export async function pindian(game, from, to, { reason = '拼点', prompt } = {}) {
  const pickOne = async (p) => {
    // 选牌窗口：技能可在这一步指定本方的拼点牌
    const d = { self: p, game, card: null, num: null };
    await game.trigger('pindian.pick', d);
    if (d.card) return { card: d.card, num: d.num == null ? (d.card.num || 0) : d.num };
    if (!p.hand.length) return null;
    const res = await game.ask(p, 'card', {
      prompt: prompt || `【${reason}】：选择一张手牌拼点`,
      cards: p.hand.map(c => c.id),
      reason,
    });
    const cid = res && res.cardId;
    const c = p.hand.find(x => x.id === cid) || p.hand[0];
    return { card: c, num: c.num || 0 };
  };
  const pb = await pickOne(to);
  const pa = await pickOne(from);
  if (!pa || !pb) {
    await game.log(`【${reason}】拼点无法进行（有一方没有手牌）`);
    return { win: false, skip: true, a: pa && pa.card, b: pb && pb.card };
  }
  const putAway = async (p, pk) => {
    // ★统一走 discardCards：牌在手牌里会正常弃置；不在任何区域（如【天辩】从牌堆顶取的牌）也会
    //   正常入堆并派发 cards.discard（【落英】【天任】【笛音】等「进入弃牌堆」技能依赖它）。
    //   旧实现走 game.pushDiscard()，只是数组 push，不派发任何事件，导致这条路径是静默的（SG025 #14）。
    await game.discardCards(p, [pk.card], { reason, silentLog: true });
  };
  await putAway(from, pa);
  await putAway(to, pb);
  const win = (pa.num || 0) > (pb.num || 0);
  await game.log(`【${reason}】拼点：${from.name} ${cardLabel(pa.card)}（${pa.num}） vs ${to.name} ${cardLabel(pb.card)}（${pb.num}） → ${win ? from.name + ' 赢' : from.name + ' 没赢'}`);
  return { win, a: pa.card, b: pb.card, aNum: pa.num, bNum: pb.num };
}
