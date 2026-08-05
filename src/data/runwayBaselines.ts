/**
 * Runway Baselines — 城镇居民人均生活消费支出数据（2025年）
 *
 * 统一指标：2025年城镇常住居民人均生活消费支出，单位为元/人/年。
 * 所有数据来自官方统计部门公开发布，经人工核验。
 * 市级/省级/全国层级不得混淆。
 * metricName 按各官方页面指标原文忠实记录。
 *
 * @see docs/RUNWAY_MVP_SPEC.md §4
 */

export type RegionLevel = 'city' | 'province' | 'national'

export interface RunwayBaseline {
  /** 唯一标识 */
  id: string
  /** 下拉选项标签，体现数据层级 */
  optionLabel: string
  /** 结果区展示的标签 */
  resultLabel: string
  /** 来源地区名称 */
  sourceRegionName: string
  /** 数据层级 */
  regionLevel: RegionLevel
  /** 数据年份 */
  dataYear: 2025
  /** 官方年值（元/人/年），必须为正整数 */
  annualYuan: number
  /** 指标原文（按各官方页面用语） */
  metricName: string
  /** 来源机构简称 */
  sourceName: string
  /** 官方来源链接 */
  sourceUrl: string
  /** 发布日期 */
  sourcePublishedAt: string
}

export const RUNWAY_BASELINES: RunwayBaseline[] = [
  {
    id: 'beijing',
    optionLabel: '北京市（市级）',
    resultLabel: '按北京市城镇居民平均估算',
    sourceRegionName: '北京市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 54122,
    metricName: '城镇居民人均消费支出',
    sourceName: '国家统计局北京调查总队',
    sourceUrl: 'https://tjj.beijing.gov.cn/zxfbu/202601/t20260121_4451977.html',
    sourcePublishedAt: '2026-01-21',
  },
  {
    id: 'shanghai',
    optionLabel: '上海市（市级）',
    resultLabel: '按上海市城镇居民平均估算',
    sourceRegionName: '上海市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 57076,
    metricName: '城镇常住居民人均消费支出',
    sourceName: '上海市统计局',
    sourceUrl: 'https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html',
    sourcePublishedAt: '2026-03-30',
  },
  {
    id: 'tianjin',
    optionLabel: '天津市（市级）',
    resultLabel: '按天津市城镇居民平均估算',
    sourceRegionName: '天津市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 39693,
    metricName: '城镇居民人均消费支出',
    sourceName: '国家统计局天津调查总队',
    sourceUrl: 'https://tjzd.stats.gov.cn/system/2026/01/20/030241179.shtml',
    sourcePublishedAt: '2026-01-20',
  },
  {
    id: 'chongqing',
    optionLabel: '重庆市（市级）',
    resultLabel: '按重庆市城镇居民平均估算',
    sourceRegionName: '重庆市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 32764,
    metricName: '城镇居民人均消费支出',
    sourceName: '重庆市统计局',
    sourceUrl: 'https://tjj.cq.gov.cn/zwgk_233/fdzdgknr/tjxx/sjjd_55469/202603/t20260326_15568538_wap.html',
    sourcePublishedAt: '2026-03-26',
  },
  {
    id: 'guangzhou',
    optionLabel: '广州市（市级）',
    resultLabel: '按广州市城镇居民平均估算',
    sourceRegionName: '广州市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 51860,
    metricName: '城镇居民家庭人均消费支出',
    sourceName: '广州市统计局',
    sourceUrl: 'https://tjj.gz.gov.cn/zzfwzq/tjkx/content/post_10804061.html',
    sourcePublishedAt: '2026-05-10',
  },
  {
    id: 'ningbo',
    optionLabel: '宁波市（市级）',
    resultLabel: '按宁波市城镇居民平均估算',
    sourceRegionName: '宁波市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 55546,
    metricName: '城镇居民人均消费支出',
    sourceName: '国家统计局宁波调查队',
    sourceUrl: 'https://zjzd.stats.gov.cn/gjtjjnbdcd/zwgk/xxgkml/xxfx/dcfx/art/2026/art_9ca88a39178245f59ae0a562dfcc9805.html',
    sourcePublishedAt: '2026-02-05',
  },
  {
    id: 'suzhou',
    optionLabel: '苏州市（市级）',
    resultLabel: '按苏州市城镇居民平均估算',
    sourceRegionName: '苏州市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 54897,
    metricName: '城镇居民人均消费支出',
    sourceName: '苏州市统计局',
    sourceUrl: 'https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml',
    sourcePublishedAt: '2026-04-30',
  },
  {
    id: 'wuhan',
    optionLabel: '武汉市（市级）',
    resultLabel: '按武汉市城镇居民平均估算',
    sourceRegionName: '武汉市',
    regionLevel: 'city',
    dataYear: 2025,
    annualYuan: 43233,
    metricName: '城镇居民人均消费支出',
    sourceName: '武汉市统计局',
    sourceUrl: 'https://tjj.wuhan.gov.cn/tjfw/tjgb/202604/t20260408_2750693.shtml',
    // 官方页实际发布日期为 2026-04-09（URL 日期为 20260408）
    sourcePublishedAt: '2026-04-09',
  },
  {
    id: 'zhejiang_other',
    optionLabel: '浙江省其他地区（省级均值）',
    resultLabel: '按浙江省城镇居民平均估算',
    sourceRegionName: '浙江省',
    regionLevel: 'province',
    dataYear: 2025,
    annualYuan: 53223,
    metricName: '城镇居民人均消费支出',
    sourceName: '国家统计局浙江调查总队',
    sourceUrl: 'https://zjzd.stats.gov.cn/zwgk/zfxxgkml/tjxx/tjgb/art/2026/art_48c3c7315981425f9c25b53eab4d65d0.html',
    sourcePublishedAt: '2026-03-04',
  },
  {
    id: 'jiangsu_other',
    optionLabel: '江苏省其他地区（省级均值）',
    resultLabel: '按江苏省城镇居民平均估算',
    sourceRegionName: '江苏省',
    regionLevel: 'province',
    dataYear: 2025,
    annualYuan: 43917,
    metricName: '城镇常住居民人均生活消费支出',
    sourceName: '国家统计局江苏调查总队',
    sourceUrl: 'https://jszd.stats.gov.cn/TrueCMS//gjtjjjsdczd/2025cxrmshzb/content/60b80fda-ee95-4288-9972-878646d06ab1.html',
    sourcePublishedAt: '2026-02-24',
  },
  {
    id: 'guangdong_other',
    optionLabel: '广东省其他地区（省级均值）',
    resultLabel: '按广东省城镇居民平均估算',
    sourceRegionName: '广东省',
    regionLevel: 'province',
    dataYear: 2025,
    annualYuan: 42726,
    metricName: '城镇居民人均生活消费支出',
    sourceName: '国家统计局广东调查总队',
    sourceUrl: 'https://gdzd.stats.gov.cn/dcsj/czjmsz/202601/t20260126_182641.html',
    sourcePublishedAt: '2026-01-26',
  },
  {
    id: 'national_urban',
    optionLabel: '其他地区（全国城镇均值）',
    resultLabel: '当地暂无首版市/省数据，按全国城镇居民平均估算',
    sourceRegionName: '全国城镇',
    regionLevel: 'national',
    dataYear: 2025,
    annualYuan: 35869,
    metricName: '城镇居民人均消费支出',
    sourceName: '国家统计局',
    sourceUrl: 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html',
    sourcePublishedAt: '2026-01-19',
  },
]

/** 按 ID 查找基线数据 */
export function findBaseline(id: string): RunwayBaseline | undefined {
  return RUNWAY_BASELINES.find(b => b.id === id)
}
