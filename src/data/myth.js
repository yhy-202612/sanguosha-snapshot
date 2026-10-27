// 「异闻」自定义包（pack: 'myth'，PACK_CN = '自定义·异闻'）
// 来源：玩家手写设计稿（2026-10-25 拍照提交）：嫦娥、哥伦比亚·希珀塞莱尼娅。
// 特点：勾玉数远超常规（7 点），配合月相/资源标记体系。
export const MYTH_GENERALS = [
  // 嫦娥：☽ 标记（月相，上限 10）+ 长征三档效果 + 满辉技
  { id: 'myth_change', name: '嫦娥（天國）', kingdom: 'shen', hp: 7, pack: 'myth', moonMax: 10,
    skills: ['dongfanghong', 'changzheng', 'fenjin', 'xinzhengcheng'] },

  // 哥伦比亚·希珀塞莱尼娅：☽ 资源 + 三相月临转换技
  { id: 'myth_columbia', name: '哥伦比亚·希珀塞莱尼娅', kingdom: 'shen', hp: 7, pack: 'myth', moonMax: 10,
    skills: ['yuedian', 'xinyue', 'sanxiang', 'xiangchou', 'wanchao'] },
];
