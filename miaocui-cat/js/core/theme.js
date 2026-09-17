/**
 * 全局色板（严格色卡，所有场景只允许引用这里的 token）
 *
 * 主色卡六色：
 *   主橙   #F9AD6A —— 按钮填充、摇杆头
 *   奶油黄 #F9E07F —— 经验条起点、+经验飘字
 *   砖红   #D46C4E —— 按钮描边、经验满提示
 *   深海青 #43978D —— 经验条终点、海草、已解锁描边、海洋点缀
 *   暗海蓝 #264D59 —— 文字主色、眼睛、描边
 *   奶油白 #FFF8E7 —— 卡片、弹层、摇杆底盘
 *
 * sea、ink、shadow 等 tint 均由深海青/暗海蓝加白淡化而来，不引入新色相。
 */
export const THEME = {
  // —— 主色卡 ——
  orange: '#F9AD6A',
  butter: '#F9E07F',
  brick: '#D46C4E',
  teal: '#43978D',
  navy: '#264D59',
  cream: '#FFF8E7',

  // —— 文字（暗海蓝淡化）——
  ink: '#264D59',
  inkSoft: '#7D949B',
  inkFaint: '#C2CDD0',

  // —— 卡片 / 弹层 ——
  creamDim: '#F3F0E4',
  shadowSoft: 'rgba(38,77,89,0.06)',
  shadow: 'rgba(38,77,89,0.10)',
  lockStroke: 'rgba(38,77,89,0.15)',

  // —— 海底背景（深海青淡化 tint）——
  seaTop: '#E8F2F0',
  seaMid: '#B8D7D4',
  seaBottom: '#98C5C0',
  seaLine: 'rgba(67,151,141,0.7)',

  // —— 海草（深海青系）——
  grassA: '#8FC4BC',
  grassB: '#43978D',

  // —— 未解锁剪影（暗海蓝极浅 tint）——
  silhouette: '#DEE5E3',

  // —— 经验数值（只由鱼色决定，与猫颜色无关）——
  expNormal: 10, // 绿 / 黄鱼
  expRare: 25, // 蓝 / 粉鱼
  expEpic: 50 // 紫 / 金鱼
}
