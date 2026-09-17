import { loadJSON, saveJSON, removeJSON } from '../core/storage'

/**
 * 颜色体系（9 色）：
 *   普通色：绿 / 蓝 / 粉 / 黄 / 橙 —— 配种 45/45/10 的随机池
 *   稀有色：紫 / 黑 / 金 / 白    —— 只能由 5% 颜色变异产出
 * body 为身体主色（粉彩），dark 深一档，用于代码花纹。
 */
export const COLORS = [
  { key: 'green', name: '翠绿', body: '#9cd8b0', dark: '#6fbf8e', rarity: 'normal' },
  { key: 'blue', name: '湛蓝', body: '#93cce9', dark: '#63add6', rarity: 'normal' },
  { key: 'pink', name: '樱粉', body: '#f8b9d1', dark: '#e893b5', rarity: 'normal' },
  { key: 'yellow', name: '鹅黄', body: '#f8df8e', dark: '#eac766', rarity: 'normal' },
  { key: 'orange', name: '蜜橙', body: '#f9c18e', dark: '#ee9d5f', rarity: 'normal' },
  { key: 'purple', name: '藤紫', body: '#cbb8ec', dark: '#a98fd8', rarity: 'rare' },
  { key: 'black', name: '墨黑', body: '#6f7f89', dark: '#46555e', rarity: 'rare' },
  { key: 'gold', name: '鎏金', body: '#f0cf6e', dark: '#d8ab3f', rarity: 'rare' },
  { key: 'white', name: '云白', body: '#f6f2e6', dark: '#cfc7b3', rarity: 'rare' }
]

/**
 * 花纹体系（6 种）：
 *   普通花纹：纯色 / 波点
 *   进阶花纹：虎斑 / 波浪   （与普通花纹一起进 10% 随机池）
 *   稀有花纹：星纹 / 云团   （只能由 8% 花纹变异产出，二者各半）
 */
export const PATTERNS = [
  { key: 'solid', name: '纯色', tier: 'normal' },
  { key: 'dots', name: '波点', tier: 'normal' },
  { key: 'stripes', name: '虎斑', tier: 'advanced' },
  { key: 'waves', name: '波浪', tier: 'advanced' },
  { key: 'stars', name: '星纹', tier: 'rare' },
  { key: 'clouds', name: '云团', tier: 'rare' }
]

const NORMAL_COLOR_KEYS = COLORS.filter((c) => c.rarity === 'normal').map((c) => c.key)
const RARE_COLOR_KEYS = COLORS.filter((c) => c.rarity === 'rare').map((c) => c.key)
/** 配种 10% 随机花纹池：普通 + 进阶（稀有花纹只能变异） */
const ROLL_PATTERN_KEYS = PATTERNS.filter((p) => p.tier !== 'rare').map((p) => p.key)
const RARE_PATTERN_KEYS = PATTERNS.filter((p) => p.tier === 'rare').map((p) => p.key)

// 变异概率（颜色 / 花纹相互独立，可同时触发）
const COLOR_MUTATE_RATE = 0.05
const PATTERN_MUTATE_RATE = 0.08
// 未变异时的继承权重：45% 随父、45% 随母、10% 随机
const INHERIT_FATHER = 0.45
const INHERIT_BOTH = 0.9

/**
 * 自我介绍 · 54 只猫逐只定制（顺序与 ROSTER 完全一致：9 色 × 6 花纹）。
 * 三档长度：话少(10~25字) 冷漠/社恐/高冷；中等(30~50字) 摆烂/嘴碎/装/搞怪；
 *           话唠(60~100字) 话唠/自来熟/操心。
 * 内容混出：冷话 / 日常 / 纯性格 / 猫际关系 / 代际自嘲 / 人类梗(少量抽用) / 方言(偶发)。
 * 每条都与其毛色、花纹对应，不矛盾。
 */
export const CAT_INTROS = [
  // —— 翠绿 ——
  { style: '冷漠', text: '绿得扎眼。没人懂最好，懂了我还得解释。' }, // 0 纯色
  {
    style: '搞怪',
    text: '我这一身波点，是昨晚数羊时被羊踩的。等等，羊不是在陆地上吗？算了，海这么大，不予追究。'
  }, // 1 波点
  {
    style: '嘴碎',
    text: '隔壁金虎斑路过从不打招呼，毛倒梳得一丝不苟。这种猫要提防，表面体面，偷你鱼干眼都不眨。'
  }, // 2 虎斑
  {
    style: '摆烂',
    text: '追了三年潮水我悟了：浪到哪我躺到哪。人类叫躺平，我们叫顺流而下，文雅点。'
  }, // 3 波浪
  { style: '高冷', text: '我背上有星星，不代表我会满足你的愿望。' }, // 4 星纹
  {
    style: '操心',
    text: '你吃饭了吗？水喝了吗？游这么快尾巴抽筋怎么办。我背上这团云就是操心操出来的，年轻时我也爱逞能，后来才知道身体是自己的。预报说有雨，你淋不着，也别往寒流里扎。'
  }, // 5 云团
  // —— 湛蓝 ——
  { style: '社恐', text: '别游这么近。你挺好，我也挺好，就是需要点距离。' }, // 6 纯色
  {
    style: '自来熟',
    text: '哎你就是新来的吧？我蓝波点，这片区我门儿清，东边珊瑚底下鱼最肥，西边三点有洋流快递，南边沉船还能捡到贝壳。跟着我混午饭我请，保你三天吃上紫鱼——哎你别走啊我话还没说完！'
  }, // 7 波点
  { style: '冷漠', text: '蓝色显白。但我白不白，与你无关。' }, // 8 虎斑
  {
    style: '装',
    text: '吾乃湛蓝波浪一脉，见本座水纹当行礼。师尊说过，蓝到深处自然沉，你听不懂，是修为不够。'
  }, // 9 波浪
  {
    style: '话唠',
    text: '跟你说昨天见一怪事，一只螃蟹横着走了一整天，我跟着看了一整天。最后它到家了我迷路了。你说好笑不？我没笑，我在它门口睡了一夜，它还嫌我挡道。'
  }, // 10 星纹
  {
    style: '操心',
    text: '那只墨黑云团又一个猫待沉船里了，三天就吃两条鱼，我看着着急。托海流给他捎过两回海带汤，原样退回来，还附俩字：谢了。你看，他心里是有我的吧？是吧？'
  }, // 11 云团
  // —— 樱粉 ——
  { style: '高冷', text: '粉色是天生的，不是为了取悦谁。' }, // 12 纯色
  { style: '社恐', text: '莫挨老子……不是，保持点距离嘛，要得不？' }, // 13 波点（川渝口音）
  {
    style: '嘴碎',
    text: '今早第三条鱼又插队，我都排到珊瑚口了，它一甩尾巴卡我前面。这海要真讲素质，我至于饿到现在？'
  }, // 14 虎斑
  {
    style: '搞怪',
    text: '我一尴尬就背手沉底装水藻，跟背手负鼠一个路数。上次装了四十分钟，被海龟啃了一口，才勉强接受现实。'
  }, // 15 波浪
  {
    style: '装',
    text: '看到我身上的星星了吗？限量。整片海域就这一身，蹭坏了，你把自己赔给我都不够。'
  }, // 16 星纹
  {
    style: '自来熟',
    text: '哎妈耶，这不是老姊妹嘛！多少年没见着你了，走走走，到我云团高头坐坐，昨个才腌的虾酱鲜得不得了，你尝尝，不好吃你把头削掉。哎你跑什么东西哎，真不给面子！'
  }, // 17 云团（合肥话）
  // —— 鹅黄 ——
  {
    style: '摆烂',
    text: '他们说我黄得像没睡醒，我不反驳，睡醒了还是这颜色。鱼会自己撞过来，急什么。'
  }, // 18 纯色
  {
    style: '操心',
    text: '你看你又不好好吃饭，腮帮子都瘦尖了。来，这半条鱼拿着，别跟我客气，我波点底下还藏了三只虾，肥得很。游慢点，前面洋流拐弯急，摔了我可不心疼——骗你的，我肯定心疼。'
  }, // 19 波点
  {
    style: '话唠',
    text: '要说这片海的规矩，得从我初代那会儿讲起，当时珊瑚还没这么高，我跟一条黑虎斑背靠背打天下。现在的二代三代哟，毛是亮了，胆子一代不如一代，人类好像也有这么个公司？嗐，不提也罢。'
  }, // 20 虎斑（代际）
  { style: '冷漠', text: '浪很大。我连一句话的功夫都不想给它。' }, // 21 波浪
  { style: '高冷', text: '星星落在黄猫身上，是星星高攀。' }, // 22 星纹
  {
    style: '搞怪',
    text: '我把云纹背成了一锅蛋花汤，这事我有责任。但主要责任在海，它非晃。我申请过让它赔，它装没听见。'
  }, // 23 云团
  // —— 蜜橙 ——
  {
    style: '嘴碎',
    text: '哎呀鱼姐姐游得好快，不像我只会慢慢游，难怪哥哥们都先吃你。我橙一点笨一点，也挺好的呀。'
  }, // 24 纯色（绿茶口吻）
  { style: '社恐', text: '我先沉下去了，上面鱼多。替我问好，就说我不在。' }, // 25 波点
  {
    style: '自来熟',
    text: '兄弟你哪条街的？我橙虎斑，这主干道上没我不认识的——墨鱼大哥早！海胆嫂子买菜去啊？你看，都熟。以后有人欺负你报我名号，虽然大概率没用，但气势要足。'
  }, // 26 虎斑
  {
    style: '操心',
    text: '夜里凉，把鳍往怀里收收，别学我年轻时那样耍帅。别嫌我唠叨，我这一身波浪纹全是逞强冲寒流冻的，一道纹一个教训，数得我心惊肉跳。你要是冻出偏头痛，后半辈子有你受的。'
  }, // 27 波浪
  {
    style: '摆烂',
    text: '我不是不合群，是在沉船底下养精神。人类管这叫阴湿男鬼，我说叫战术潜伏。男鬼记仇，我只记鱼。'
  }, // 28 星纹
  { style: '冷漠', text: '橙色太亮。所以我很少出现。' }, // 29 云团
  // —— 藤紫 ——
  { style: '高冷', text: '紫色稀有。和我说话，排队的鱼从这排到珊瑚礁。' }, // 30 纯色
  {
    style: '嘴碎',
    text: '看见最闪那条金波点没？昨天问我借海盐，还的时候少了半勺。半勺！我能记一辈子，你别劝。'
  }, // 31 波点
  {
    style: '装',
    text: '这身虎斑是祖上传的纹路，紫色的，懂吗。远观可以，别上手，摸一下三十贝壳，包月八十。'
  }, // 32 虎斑
  {
    style: '话唠',
    text: '哎你可来了，东边那个贝壳挂号的中医馆晓得吧？我姐们儿非拉我去喝中药，苦得我鳞片都竖了。她说喝了调理，调理完我看见母猫还是心动，这药怕是抓错了，明天还得去闹，你陪不陪？'
  }, // 33 波浪
  { style: '社恐', text: '被看到了。我明明躲在最深的紫色里。' }, // 34 星纹
  {
    style: '搞怪',
    text: '我最大的理想是当一条海带，不用动，饭自己飘进嘴里。为了配合理想，我已经先把形状躺出来了。'
  }, // 35 云团
  // —— 墨黑 ——
  { style: '冷漠', text: '别问。问就是不知道。知道了也不告诉你。你非要问，我就走。' }, // 36 纯色
  { style: '高冷', text: '黑底白点，像夜。你见过夜解释自己吗。' }, // 37 波点
  {
    style: '话唠',
    text: '跟你讲嘛，昨天黑老子一跳，一只虾米钻我虎斑纹路里头躲猫，找半天找不着，最后它个人探个脑壳出来说谢谢哥。谢啥子哦，搞得我黑尴尬。你说这海里的事情笑不笑人嘛。'
  }, // 38 虎斑（四川话）
  {
    style: '摆烂',
    text: '黑鱼配黑浪，我不游，你都找不到我。上班？上什么班，深海最适合的就是消失。'
  }, // 39 波浪
  {
    style: '装',
    text: '看见这条星河背了吗。富婆快乐背。你努力一辈子也达不到这亮度。叫姐姐，心情好分你两粒鱼籽。'
  }, // 40 星纹
  { style: '高冷', text: '蓝云团的汤我退了。不是不领情，是我这里不需要热闹。' }, // 41 云团
  // —— 鎏金 ——
  {
    style: '嘴碎',
    text: '今早洋流又改道，第三回了！海葵装修也不报备，叮咣一上午，这海底物业我看是真不打算干了。'
  }, // 42 纯色
  {
    style: '自来熟',
    text: '哎哟这位爷，一看就气宇轩昂！我金波点，别的本事没有，认鱼第一快，谁地盘大鱼多，问我准没错。哎你见过隔壁奶龙没？齁齁齁的，胖得洋流都绕着走，还跟我比排场。'
  }, // 43 波点
  {
    style: '装',
    text: '这片海的鱼归我管。不是我想吃，是秩序需要我。年轻的猫见了我，都叫一声教父。'
  }, // 44 虎斑
  {
    style: '操心',
    text: '三代里就数你最淘，浪最大的地方你偏去，拽都拽不住。你爷爷当年也是鎏金波浪，闯寒流落下偏头痛，现在天天让我按太阳穴，一边按一边嘴硬说不疼。你贴着我游，别撒欢，听见没。'
  }, // 45 波浪（代际）
  { style: '冷漠', text: '金子不说话的时候，最贵。' }, // 46 星纹
  {
    style: '搞怪',
    text: '上周沉船着火，我披着湿海带第一个冲进去拖出三只虾米。消防队要给我颁奖，我说不必。铁猫救火，不留姓名。'
  }, // 47 云团
  // —— 云白 ——
  { style: '社恐', text: '我白得太显眼了。真羡慕黑鱼，他可以随便消失。' }, // 48 纯色
  { style: '高冷', text: '那只黑猫总看我。我不说，但我都知道。' }, // 49 波点（关系）
  {
    style: '话唠',
    text: '你问我白毛怎么保养的？嗐，哪有秘方，少管闲事多睡觉，睡前顺时针捋毛三十六下，逆着再来三十六下，珊瑚灰的地方别去，墨斗鱼喷墨时闭眼——张嘴那个是我乱说的啊，你可别试。'
  }, // 50 虎斑
  {
    style: '自来熟',
    text: '哎哎哎，鱼缘就是这么回事，你笑一笑，鱼自己就游过来了。你成天绷着个脸哪行，鱼都被你吓跑了。来，跟姐学，嘴角上扬，对嘛，保持住。走走走，前边虾群正开饭，姐带你混个肚圆。'
  }, // 51 波浪
  {
    style: '摆烂',
    text: '我这么白还带星星，已经赢在起跑线上了。起跑线之后的事，我不参与，你们慢慢卷，我先眯会儿。'
  }, // 52 星纹
  { style: '冷漠', text: '云在天上，也在我背上。你抬头就行，不用跟我说话。' } // 53 云团
]

/**
 * 图鉴名单：颜色 × 花纹 笛卡尔积（9 × 6 = 54）。
 * entry: { id, colorKey, patternKey, name, body, dark, colorRarity, patternTier, rare,
 *          introStyle, intro, gen }
 */
export const ROSTER = []
COLORS.forEach((c) => {
  PATTERNS.forEach((p) => {
    const idx = ROSTER.length
    const introDef = CAT_INTROS[idx]
    ROSTER.push({
      id: `${c.key}-${p.key}`,
      colorKey: c.key,
      patternKey: p.key,
      name: `${c.name}·${p.name}`,
      body: c.body,
      dark: c.dark,
      colorRarity: c.rarity,
      patternTier: p.tier,
      rare: c.rarity === 'rare' || p.tier === 'rare',
      introStyle: introDef.style,
      intro: introDef.text,
      gen: 1
    })
  })
})

/**
 * 特殊猫（仅商店购买，配色/花纹不在配种名单内，不能当父母但可主控）。
 * id 以 special- 开头，catArt 据此走特殊绘制分支。
 * entry 字段与 ROSTER 对齐，额外含 price / accessory / special:true。
 */
export const SPECIAL_CATS = [
  {
    id: 'special-sun',
    colorKey: 'special-sun',
    patternKey: 'special',
    name: '太阳喵',
    body: '#ffffff',
    dark: '#f0cf6e',
    colorRarity: 'normal',
    patternTier: 'normal',
    rare: false,
    introStyle: '自来熟',
    intro: '把光全揣在我毛里了呀，你嫌亮就躲到我背后游。',
    gen: 1,
    price: 15,
    accessory: 'bell',
    special: true
  },
  {
    id: 'special-star',
    colorKey: 'special-star',
    patternKey: 'special',
    name: '星空喵',
    body: '#264D59',
    dark: '#b59cf0',
    colorRarity: 'normal',
    patternTier: 'normal',
    rare: false,
    introStyle: '高冷',
    intro: '整条银河都掉我背上了呀，别问，问就是天意难违。',
    gen: 1,
    price: 20,
    accessory: 'bow',
    special: true
  },
  {
    id: 'special-rainbow',
    colorKey: 'special-rainbow',
    patternKey: 'special',
    name: '嘤嘤喵',
    body: '#ffffff',
    dark: '#e893b5',
    colorRarity: 'normal',
    patternTier: 'normal',
    rare: false,
    introStyle: '话唠',
    intro: '彩虹阳光都是我的呀，全世界都得乖乖听我嘤嘤。',
    gen: 1,
    price: 30,
    accessory: 'scarf',
    special: true
  }
]

// ------------------------------------------------------------------
// 存档 v4：
//   owned:    [{ uid, id, gen }] 已拥有的猫实例（可重复品种、不同代数）
//   eggs:     [uid]               孵化槽里的空蛋
//   exp:      探索区经验
//   fishEaten:累计吃掉的鱼鱼数（成就用）
//   achieved: [成就 id] 已解锁成就（单一数据源，成就模块只读判定）
// v4 规则：9 色 6 花纹、颜色 5% / 花纹 8% 独立变异、取消代数花纹限制
// ------------------------------------------------------------------
const SAVE_KEY = 'mcm_save_v4'
const OLD_SAVE_KEY = 'mcm_save_v3'
const OLDEST_SAVE_KEY = 'mcm_save_v2'
const BACKUP_KEY = 'mcm_save_v4_bak' // 启动快照：主档读失败/被清时下次启动可回滚

/**
 * 下蛋经验逐轮递增：第 1 颗蛋 100、第 2 颗 200、第 3 颗 300……
 * 第 n 颗（n = 已下蛋数 + 1）需要 n × EXP_BASE。
 */
export const EXP_BASE = 100

const state = {
  owned: [],
  eggs: [],
  exp: 0,
  eggsLaid: 0, // 累计已下蛋次数（决定当前这一轮所需经验）
  fishEaten: 0,
  frenzyCount: 0, // 肥猫狂暴蓄力（跨场景/重开保留，触发或狂暴结束清零）
  evolutionPoints: 0, // 进化点数：重复猫分解获得（强化/特殊猫商店消费，阶段二/三启用）
  upgrades: { speed: 0, size: 0, combo: 0 }, // 全局强化等级（0~3），对所有猫通用
  activeCatId: null, // 当前主控猫 id（null 时取第一只解锁的普通猫）
  achieved: []
}

let uidSeq = 1
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}_${(
    Math.random() * 1e4 |
    0
  ).toString(36)}`
}

const rosterById = {}
ROSTER.forEach((e) => (rosterById[e.id] = e))
// 特殊猫也进查找表（getRosterEntry/owned 过滤/立绘绘制都能查到），
// 但它们不在 ROSTER（配种名单）里，breedChild 会依据 special 标记拒绝。
SPECIAL_CATS.forEach((e) => (rosterById[e.id] = e))

export function getRosterEntry(id) {
  return rosterById[id] || null
}

/** 开局三只初代：绿·纯色 / 鹅黄·虎斑 / 蓝·波点 */
const STARTER_IDS = ['green-solid', 'yellow-stripes', 'blue-dots']

export function initState() {
  let data = loadJSON(SAVE_KEY)

  // 兼容迁移 v3 → v4（v3 的品种 id 在新名单中全部仍然存在，原样保留实例与代数）
  if (!data) {
    data = loadJSON(OLD_SAVE_KEY)
    if (data) removeJSON(OLD_SAVE_KEY)
  }
  // 再早的 v2：只有 unlocked id 数组，全部视为初代实例
  if (!data) {
    const oldest = loadJSON(OLDEST_SAVE_KEY)
    if (oldest && Array.isArray(oldest.unlocked) && oldest.unlocked.length) {
      data = { owned: oldest.unlocked.map((id) => ({ uid: uid('c'), id, gen: 1 })), exp: oldest.exp || 0 }
    }
    removeJSON(OLDEST_SAVE_KEY)
  }
  // 主档读不到：回滚上一次启动的快照（防读失败/误清把好档覆盖成初始档）
  if (!data) {
    const bak = loadJSON(BACKUP_KEY)
    if (bak && Array.isArray(bak.owned) && bak.owned.length) data = bak
  }

  if (data && Array.isArray(data.owned) && data.owned.length) {
    state.owned = data.owned
      .filter((o) => o && rosterById[o.id])
      .map((o) => ({ uid: o.uid || uid('c'), id: o.id, gen: o.gen || 1 }))
  } else {
    state.owned = STARTER_IDS.map((id) => ({ uid: uid('c'), id, gen: 1 }))
  }

  state.eggs = data && Array.isArray(data.eggs) ? data.eggs.slice() : []
  state.eggsLaid =
    data && typeof data.eggsLaid === 'number' ? Math.max(0, data.eggsLaid | 0) : 0
  state.exp =
    data && typeof data.exp === 'number'
      ? Math.min(getExpMax(), Math.max(0, data.exp))
      : 0
  state.fishEaten = data && typeof data.fishEaten === 'number' ? Math.max(0, data.fishEaten | 0) : 0
  state.frenzyCount =
    data && typeof data.frenzyCount === 'number' ? Math.max(0, data.frenzyCount | 0) : 0
  state.evolutionPoints =
    data && typeof data.evolutionPoints === 'number'
      ? Math.max(0, data.evolutionPoints | 0)
      : 0
  state.upgrades = {
    speed: clampUpgrade(data && data.upgrades && data.upgrades.speed),
    size: clampUpgrade(data && data.upgrades && data.upgrades.size),
    combo: clampUpgrade(data && data.upgrades && data.upgrades.combo)
  }
  state.activeCatId =
    data && typeof data.activeCatId === 'string' && rosterById[data.activeCatId]
      ? data.activeCatId
      : null
  state.fishSpecies =
    data && Array.isArray(data.fishSpecies)
      ? data.fishSpecies.filter((k) => typeof k === 'string')
      : []
  state.achieved =
    data && Array.isArray(data.achieved) ? data.achieved.filter((a) => typeof a === 'string') : []
  if (data) {
    // 有载入来源（主档/迁移/快照回滚）才落盘 + 快照；
    // 全新档只置内存初始态 —— 防止读失败等异常场景用初始档覆盖好档
    saveJSON(BACKUP_KEY, snapshot())
    persist()
  }
}

function snapshot() {
  return {
    owned: state.owned,
    eggs: state.eggs,
    exp: state.exp,
    eggsLaid: state.eggsLaid,
    fishEaten: state.fishEaten,
    frenzyCount: state.frenzyCount,
    evolutionPoints: state.evolutionPoints,
    upgrades: state.upgrades,
    activeCatId: state.activeCatId,
    fishSpecies: state.fishSpecies,
    achieved: state.achieved
  }
}

export function persist() {
  saveJSON(SAVE_KEY, snapshot())
}

// ---- 经验（鱼只给经验，与猫颜色完全无关）----
export function getExp() {
  return state.exp
}

/** 当前这一轮下一颗蛋所需经验：第 n 颗 = n × 100 */
export function getExpMax() {
  return (state.eggsLaid + 1) * EXP_BASE
}

/** 增加经验，截断在当前满槽；返回实际增加量 */
export function gainExp(amount) {
  const before = state.exp
  state.exp = Math.min(getExpMax(), state.exp + amount)
  persist()
  return state.exp - before
}

export function isExpFull() {
  return state.exp >= getExpMax()
}

/** 当前等级：第几轮孵蛋（每级所需经验 = 等级 × 100） */
export function getLevel() {
  return state.eggsLaid + 1
}

/**
 * 是否有存档进度（决定封面显示"继续游戏"还是"开始游戏"）：
 * 只要是"开局三只 + 全零"的纯新档就返回 false。
 */
export function hasProgress() {
  if (state.eggs.length || state.eggsLaid > 0) return true
  if (state.exp > 0 || state.fishEaten > 0) return true
  if (state.evolutionPoints > 0 || state.frenzyCount > 0) return true
  if (state.fishSpecies.length || state.achieved.length) return true
  if (state.activeCatId) return true
  if (state.upgrades.speed > 0 || state.upgrades.size > 0 || state.upgrades.combo > 0) return true
  if (state.owned.length !== STARTER_IDS.length) return true
  for (const o of state.owned) {
    if (STARTER_IDS.indexOf(o.id) === -1) return true
  }
  return false
}

/** 重新开始：清空全部进度回初始档（开局三只 + 全零），不可撤销 */
export function resetSave() {
  state.owned = STARTER_IDS.map((id) => ({ uid: uid('c'), id, gen: 1 }))
  state.eggs = []
  state.eggsLaid = 0
  state.exp = 0
  state.fishEaten = 0
  state.frenzyCount = 0
  state.evolutionPoints = 0
  state.upgrades = { speed: 0, size: 0, combo: 0 }
  state.activeCatId = null
  state.fishSpecies = []
  state.achieved = []
  persist()
}

// ---- 图鉴 / 拥有 ----
export function getOwned() {
  return state.owned
}

export function isUnlocked(id) {
  return state.owned.some((o) => o.id === id)
}

export function unlockedCount() {
  const set = {}
  state.owned.forEach((o) => (set[o.id] = 1))
  return Object.keys(set).length
}

/** 孵化出新猫实例；同品种图鉴只会点亮一次 */
export function addCatInstance(id, gen) {
  const inst = { uid: uid('c'), id, gen }
  state.owned.push(inst)
  persist()
  return inst
}

// ---- 进化点数（重复猫分解；强化与特殊猫商店在后续阶段消费）----
export function getEvolutionPoints() {
  return state.evolutionPoints
}

/** 增减进化点数并持久化，返回最新值（扣费时由调用方先判余额） */
export function addEvolutionPoints(amount) {
  state.evolutionPoints = Math.max(0, state.evolutionPoints + Math.floor(amount))
  persist()
  return state.evolutionPoints
}

/**
 * 分解值（唯一规则出口）：
 *   普通色 + 普通/进阶花纹 = 1
 *   稀有色 或 稀有花纹（星纹/云团）= 3
 *   稀有色 + 稀有花纹 双稀有 = 5
 * 进阶花纹（虎斑/波浪）不算稀有花纹。
 */
export function evolutionValue(entry) {
  if (!entry) return 0
  const rareColor = entry.colorRarity === 'rare'
  const rarePattern = entry.patternTier === 'rare'
  if (rareColor && rarePattern) return 5
  if (rareColor || rarePattern) return 3
  return 1
}

/**
 * 重复猫自动分解：不进入图鉴，折算成进化点数。
 * @returns {number} 实际获得点数（名单外 id 返回 0）
 */
export function decomposeDuplicate(entryId) {
  const entry = rosterById[entryId]
  if (!entry) return 0
  const pts = evolutionValue(entry)
  addEvolutionPoints(pts)
  return pts
}

// ---- 强化（三条线各 3 级，全局通用，换猫不丢；点数唯一消费出口之一）----
export const UPGRADE_MAX = 3
export const UPGRADE_COST = 2 // 每级固定 2 点
/**
 * 各等级累计效果（索引即等级）：
 *   speed/size 速度与体型：+4% / +7% / +10%（满级硬顶 +10%，不破坏平衡）
 *   combo 连吃窗口延长 ms：+300 / +600 / +900（基础窗口 2000ms）
 */
export const UPGRADE_LINES = [
  {
    key: 'speed',
    name: '游速',
    desc: '猫咪游泳速度',
    values: [0, 0.04, 0.07, 0.1],
    fmt: (v) => `+${Math.round(v * 100)}%`
  },
  {
    key: 'size',
    name: '体型',
    desc: '体型与吃鱼范围',
    values: [0, 0.04, 0.07, 0.1],
    fmt: (v) => `+${Math.round(v * 100)}%`
  },
  {
    key: 'combo',
    name: '连吃时间',
    desc: '连吃判定窗口延长',
    values: [0, 300, 600, 900],
    fmt: (ms) => `+${(ms / 1000).toFixed(1)}秒`
  }
]

function clampUpgrade(v) {
  const n = typeof v === 'number' ? v | 0 : 0
  return Math.max(0, Math.min(UPGRADE_MAX, n))
}

export function getUpgrades() {
  return state.upgrades
}

export function getUpgradeLevel(key) {
  return state.upgrades[key] || 0
}

/** 速度乘数（1 = 无强化） */
export function getUpgradeSpeedMult() {
  return 1 + UPGRADE_LINES[0].values[state.upgrades.speed]
}

/** 体型乘数（视觉尺寸与吃鱼/碰撞半径共用） */
export function getUpgradeSizeMult() {
  return 1 + UPGRADE_LINES[1].values[state.upgrades.size]
}

/** 连吃窗口延长 ms */
export function getUpgradeComboBonus() {
  return UPGRADE_LINES[2].values[state.upgrades.combo]
}

/**
 * 购买一级强化。
 * @returns {{ok:boolean, reason?:'max'|'poor', level?:number, points?:number, short?:number}}
 */
export function buyUpgrade(key) {
  const line = UPGRADE_LINES.find((l) => l.key === key)
  if (!line) return { ok: false, reason: 'max' }
  const lv = state.upgrades[key] || 0
  if (lv >= UPGRADE_MAX) return { ok: false, reason: 'max' }
  if (state.evolutionPoints < UPGRADE_COST) {
    return { ok: false, reason: 'poor', short: UPGRADE_COST - state.evolutionPoints }
  }
  addEvolutionPoints(-UPGRADE_COST)
  state.upgrades[key] = lv + 1
  persist()
  return { ok: true, level: lv + 1, points: state.evolutionPoints }
}

// ---- 特殊猫商店 ----
/** 是否已经拥有某只特殊猫（同一只不重复入库） */
export function ownsSpecialCat(specialId) {
  return state.owned.some((o) => o.id === specialId)
}

/**
 * 购买特殊猫。返回 { ok, reason?:'owned'|'poor', short?, inst? }。
 * 购买成功：扣点、入库一个实例（gen=1）、若尚未设主控则自动设为当前主控。
 */
export function buySpecialCat(specialId) {
  const entry = rosterById[specialId]
  if (!entry || !entry.special) return { ok: false, reason: 'owned' }
  if (ownsSpecialCat(specialId)) return { ok: false, reason: 'owned' }
  const price = entry.price || 0
  if (state.evolutionPoints < price) {
    return { ok: false, reason: 'poor', short: price - state.evolutionPoints }
  }
  addEvolutionPoints(-price)
  const inst = addCatInstance(specialId, 1)
  if (!state.activeCatId) state.activeCatId = specialId
  persist()
  return { ok: true, inst }
}

// ---- 主控猫 ----
export function getActiveCatId() {
  return state.activeCatId
}

export function setActiveCatId(id) {
  if (!rosterById[id]) return
  state.activeCatId = id
  persist()
}

/** 当前主控猫 entry；未设时取第一只解锁的（普通猫优先） */
export function getActiveCatEntry() {
  if (state.activeCatId && rosterById[state.activeCatId]) {
    return rosterById[state.activeCatId]
  }
  return (
    state.owned
      .map((o) => rosterById[o.id])
      .filter((e) => e && !e.special)[0] ||
    state.owned.map((o) => rosterById[o.id]).find((e) => !!e) ||
    ROSTER[0]
  )
}

// ---- 蛋槽 ----
export function getEggs() {
  return state.eggs
}

export function eggCount() {
  return state.eggs.length
}

/**
 * 经验满 → 一颗空蛋进孵化槽。
 * 下蛋是唯一的“轮次推进点”：经验清零、所需经验 +100，
 * 全项目不要再在别处清经验，避免重复清零。
 */
export function layEgg() {
  const id = uid('e')
  state.eggs.push(id)
  state.eggsLaid += 1
  state.exp = 0
  persist()
  return id
}

export function consumeEgg(eggUid) {
  const i = state.eggs.indexOf(eggUid)
  if (i >= 0) state.eggs.splice(i, 1)
  persist()
}

// ---- 里程碑统计（成就）----
export function getFishEaten() {
  return state.fishEaten
}

/** 吃鱼计数 + 记录鱼种类（首次吃到新种类返回 true） */
export function addFishEaten(colorKey) {
  state.fishEaten += 1
  let newSpecies = false
  if (colorKey && state.fishSpecies.indexOf(colorKey) < 0) {
    state.fishSpecies.push(colorKey)
    newSpecies = true
  }
  persist()
  return newSpecies
}

/** 已收集的鱼种类数（0~6，隐藏成就用） */
export function getFishSpeciesCount() {
  return state.fishSpecies.length
}

// ---- 肥猫狂暴蓄力（只持久化计数；运行态 active/t 不跨场景）----
export function getFrenzyCount() {
  return state.frenzyCount
}

/** 普通态每吃一条 +1，返回最新计数 */
export function addFrenzyFish() {
  state.frenzyCount += 1
  persist()
  return state.frenzyCount
}

/** 狂暴触发 / 结束时归零 */
export function resetFrenzyCount() {
  if (state.frenzyCount !== 0) {
    state.frenzyCount = 0
    persist()
  }
}

export function getAchieved() {
  return state.achieved
}

export function isAchieved(id) {
  return state.achieved.indexOf(id) >= 0
}

/** 解锁成就；已存在返回 false，新解锁返回 true */
export function markAchieved(id) {
  if (state.achieved.indexOf(id) >= 0) return false
  state.achieved.push(id)
  persist()
  return true
}

// ------------------------------------------------------------------
// 配种规则（任何两只猫都能配；颜色、花纹各自独立掷骰）
//
// 颜色：5% 变异 → 稀有四色（紫/黑/金/白）等概率，不看父母；
//       95% 常规 → 45% 随父、45% 随母、10% 随机普通五色。
// 花纹：8% 变异 → 星纹/云团各半，不看父母；
//       92% 常规 → 45% 随父、45% 随母、10% 随机普通+进阶四花纹。
// 代数：max(父母代数) + 1，代数不再限制花纹。
// ------------------------------------------------------------------
function pick(pool) {
  return pool[(Math.random() * pool.length) | 0]
}

/** 返回 { key, mutated }；变异判定与继承掷骰共用这一次随机 */
function rollTrait(fatherKey, motherKey, mutateRate, rarePool, normalPool) {
  if (Math.random() < mutateRate) return { key: pick(rarePool), mutated: true }
  const r = Math.random()
  if (r < INHERIT_FATHER) return { key: fatherKey, mutated: false }
  if (r < INHERIT_BOTH) return { key: motherKey, mutated: false }
  return { key: pick(normalPool), mutated: false }
}

/**
 * @param {{uid:string}} fatherInst 父实例
 * @param {{uid:string}} motherInst 母实例
 * @returns {{ entry:object, gen:number, isNew:boolean, colorMutated:boolean, patternMutated:boolean }}
 */
export function breedChild(fatherInst, motherInst) {
  const f = rosterById[fatherInst.id]
  const m = rosterById[motherInst.id]
  // 特殊猫不能当父母（配色/花纹不在配种系统内）
  if (!f || !m || f.special || m.special) {
    return { entry: null, gen: 1, isNew: false, colorMutated: false, patternMutated: false }
  }
  const gen = Math.max(fatherInst.gen || 1, motherInst.gen || 1) + 1

  // 颜色、花纹各自独立掷骰，可以同时变异
  const color = rollTrait(
    f.colorKey,
    m.colorKey,
    COLOR_MUTATE_RATE,
    RARE_COLOR_KEYS,
    NORMAL_COLOR_KEYS
  )
  const pattern = rollTrait(
    f.patternKey,
    m.patternKey,
    PATTERN_MUTATE_RATE,
    RARE_PATTERN_KEYS,
    ROLL_PATTERN_KEYS
  )

  const entry = rosterById[`${color.key}-${pattern.key}`]
  return {
    entry,
    gen,
    isNew: !isUnlocked(entry.id),
    colorMutated: color.mutated,
    patternMutated: pattern.mutated
  }
}
