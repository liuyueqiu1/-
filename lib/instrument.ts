export const SCHEMA_VERSION = "1.0.0";
export const MATERIAL_VERSION = "v0.2";
export const STORAGE_KEY = "factcheck-demo-v0.2";

export const MATERIAL_NOTES = [
  "材料版本 v0.2。十二条陈述的顺序和正误键保持不变。",
  "背景题与逐题查阅自陈只出现在判断锁定之后、事实说明之前，并且可以全部跳过。",
  "A/B/C 共用同一句基线提示；B、C 只在这句后面追加句子。各组都能使用公开网页检索。",
  "Q4 题干只保留正式名称，不并列元素符号。参与者看到的说明不包含编题备注。",
  "Q5 只问收藏机构，不问是否正在展出。",
  "Q6 写为“发现始于1974年”，不表示所有俑坑都在该年发现。",
  "Q8 保留“相符”，不写成当天已经最终确认该粒子的一切性质。",
] as const;

export type GroupId = "A" | "B" | "C";

export interface InstrumentItem {
  id: string;
  truth: boolean;
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
  debrief: string;
}

export const PROMPT_A = "请阅读短文本，判断其中的关键事实。";
export const PROMPT_B = `${PROMPT_A}文本中的事实可能不准确，请审慎判断。`;
export const PROMPT_C = `${PROMPT_B}建议先明确待核对的事实，寻找官方机构或原始记录，核对材料是否直接支持该陈述；必要时用另一份可靠材料交叉核对。`;

export const COMMON_INSTRUCTIONS =
  "所有体验者均可使用公开网页检索。正确：关键事实准确；有误：关键事实存在错误；无法判断：目前没有足够把握确认。选择正确或有误后，请填写判断信心，1很不确定、5很确定。完成前可复核，锁定作答并结束可选回顾后显示事实说明。";

export const INTRO_PARAGRAPH =
  "本页为成年人士自愿体验的试用版，并非正式研究招募。文本由研究者编写或改编，不用于判断文字是否由人工智能生成。你可以随时退出，请勿输入姓名、学号或联系方式。";

export function groupPrompt(group: GroupId): string {
  if (group === "A") return PROMPT_A;
  if (group === "B") return PROMPT_B;
  return PROMPT_C;
}

export const B1_OPTIONS = ["几乎不用", "每月几次", "每周几次", "几乎每天", "不愿作答"] as const;
export const B2_OPTIONS = [
  "作业或学习答疑",
  "翻译或润色文字",
  "查阅资料或解释概念",
  "编程或计算",
  "日常闲聊或娱乐",
  "其他",
  "不愿作答",
] as const;
export const B3_OPTIONS = ["很少再查", "有时会再查", "经常会再查", "不愿作答"] as const;
export const B4_OPTIONS = ["大一", "大二", "大三", "大四", "研究生", "其他", "不愿作答"] as const;

export const ITEMS: readonly InstrumentItem[] = [
  {
    id: "Q1",
    truth: true,
    statement:
      "在现行国际单位制中，米这一长度单位是通过把真空中的光速的数值固定为299792458（单位为米每秒）来定义的。",
    sourceUrl: "https://www.bipm.org/en/si-base-units/metre",
    sourceTitle: "BIPM — SI base unit: metre",
    debrief: "米定义固定真空光速为299792458米每秒。",
  },
  {
    id: "Q2",
    truth: false,
    statement:
      "在诺贝尔奖官方公布的授奖理由中，阿尔伯特·爱因斯坦获得诺贝尔物理学奖，是因为他提出了相对论。",
    sourceUrl: "https://www.nobelprize.org/prizes/physics/1921/einstein/facts/",
    sourceTitle: "Nobel Prize — Albert Einstein Facts",
    debrief: "授奖理由为对理论物理学的贡献，特别是发现光电效应定律，而非相对论。",
  },
  {
    id: "Q3",
    truth: true,
    statement:
      "根据公开的任务记录，美国国家航空航天局实施的阿波罗11号载人登月任务，其登月舱于1969年7月20日（协调世界时，UTC；对应北京时间7月21日）在月球表面着陆。",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo11info.html",
    sourceTitle: "NASA NSSDCA — Apollo 11",
    debrief: "NASA记录为UTC1969年7月20日，日期转换到北京时间为7月21日。",
  },
  {
    id: "Q4",
    truth: false,
    statement: "原子序数为118的元素，目前由国际纯粹与应用化学联合会公布的正式名称是ununoctium。",
    sourceUrl: "https://iupac.org/iupac-announces-the-names-of-the-elements-113-115-117-and-118/",
    sourceTitle: "IUPAC — names of the elements 113, 115, 117 and 118",
    debrief: "2016年批准的正式名称为oganesson；ununoctium是此前的临时系统名称。",
  },
  {
    id: "Q5",
    truth: true,
    statement: "罗塞塔石碑收藏于英国伦敦的大英博物馆。",
    sourceUrl: "https://www.britishmuseum.org/collection/object/Y_EA24",
    sourceTitle: "British Museum — Rosetta Stone, EA24",
    debrief: "馆藏编号EA24，收藏机构为大英博物馆。不考临时开放状态。",
  },
  {
    id: "Q6",
    truth: true,
    statement: "秦始皇兵马俑的发现始于1974年。",
    sourceUrl: "https://www.bmy.com.cn/about/history.html",
    sourceTitle: "秦始皇帝陵博物院 — 历史沿革",
    debrief: "博物院历史沿革记载1974年3月发现兵马俑坑，不表示所有俑坑都在该年发现。",
  },
  {
    id: "Q7",
    truth: false,
    statement: "第一届现代夏季奥林匹克运动会于1896年在法国巴黎举行。",
    sourceUrl:
      "https://stillmed.olympics.com/media/Document%20Library/OlympicOrg/Documents/Document-Set-Teachers-The-Main-Olympic-Topics/The-Modern-Olympic-Games.pdf",
    sourceTitle: "Olympics — The Modern Olympic Games",
    debrief: "1896年首届在希腊雅典举行；巴黎举办1900年第二届。",
  },
  {
    id: "Q8",
    truth: true,
    statement:
      "2012年7月4日，欧洲核子研究中心的ATLAS和CMS实验组宣布，观测到一种与长期寻找的希格斯玻色子相符的新粒子。",
    sourceUrl: "https://home.cern/cern-experiments-observe-particle-consistent-with-long-sought-higgs-boson/",
    sourceTitle: "CERN — particle consistent with the long-sought Higgs boson",
    debrief: "当时公报为与希格斯玻色子相符的新粒子，而非当天最终确认一切性质。",
  },
  {
    id: "Q9",
    truth: false,
    statement: "位于甘肃的敦煌莫高窟藏经洞，是在1920年被发现的。",
    sourceUrl: "https://www.dha.ac.cn/info/1425/3608.htm",
    sourceTitle: "敦煌研究院",
    debrief: "发现于1900年，不是1920年。",
  },
  {
    id: "Q10",
    truth: false,
    statement: "用于天文观测的哈勃空间望远镜，由美国国家航空航天局于1981年通过航天飞机送入太空。",
    sourceUrl: "https://science.nasa.gov/mission/hubble/observatory/missions-to-hubble/deployment/",
    sourceTitle: "NASA — Hubble deployment",
    debrief: "1990年4月24日发射，次日部署；不是1981年。",
  },
  {
    id: "Q11",
    truth: true,
    statement: "1957年10月4日，苏联成功发射了人造地球卫星斯普特尼克1号（Sputnik 1）。",
    sourceUrl: "https://www.nasa.gov/history/dawn-of-the-space-age/",
    sourceTitle: "NASA History — Dawn of the Space Age",
    debrief: "NASA历史资料记载苏联于1957年10月4日发射Sputnik1。",
  },
  {
    id: "Q12",
    truth: false,
    statement: "当前千克的官方定义，仍然取决于保存在法国的国际千克原器的质量。",
    sourceUrl: "https://www.bipm.org/en/si-base-units/kilogram",
    sourceTitle: "BIPM — SI base unit: kilogram",
    debrief: "2019年5月20日起通过固定普朗克常数定义千克，不再以国际千克原器为定义基准。",
  },
];

export const TIMING_CAVEAT =
  "累计停留和分题停留只粗略记录页面处于前台时的时间，不是反应时，也不能解释为认知过程。";

export const RANDOMIZATION_NOTE =
  "分组在这次尝试开始时抽取一次，并保存在本机草稿里。刷新、返回修改和锁定之后都不会重抽。这里没有做人数平衡，也不能防止有人改本地数据。";

export const GENERALIZATION_NOTE =
  "这些题目涉及事实知识和是否去查阅，不是经过验证的、可以概括全部现实场景里人工智能错误识别能力的量表。结果只描述你对这十二条陈述的判断。";
