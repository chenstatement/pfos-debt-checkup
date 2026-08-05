/**
 * 不上班能过基线（2025 年度口径）。
 *
 * annualYuan：2025 年城镇居民人均生活消费支出（元/人/年）。
 * minimumWageMonthlyYuan：2025 年适用的最低档月最低工资（元/月）。
 * 最低工资表按 2025-07-01 人社部公开表；本产品只做情景估算，不代表个人预算。
 */

export type RegionLevel = 'city' | 'province' | 'national'
export type RegionGroup = '一线城市' | '新一线城市' | '华东' | '西北' | '东北' | '西南' | '华南' | '华中' | '全国'

export interface RunwayBaseline {
  id: string
  optionLabel: string
  resultLabel: string
  sourceRegionName: string
  regionLevel: RegionLevel
  regionGroup: RegionGroup
  dataYear: 2025
  annualYuan: number
  metricName: string
  sourceName: string
  sourceUrl: string
  sourcePublishedAt: string
  minimumWageMonthlyYuan: number
  minimumWageSourceName: string
  minimumWageSourceUrl: string
  minimumWageMethod: string
  dataNote?: string
}

const MIN_WAGE_SOURCE_NAME = '人力资源和社会保障部 2025-07-01 公开表（中国经济网转载）'
const MIN_WAGE_SOURCE_URL = 'https://www.ce.cn/xwzx/gnsz/gdxw/202507/t20250717_2411058.shtml'
const CITY_METRIC = '城镇居民人均生活消费支出'
const PROVINCE_METRIC = '城镇居民人均生活消费支出'

function city(
  id: string, name: string, group: '一线城市' | '新一线城市', annualYuan: number, wage: number,
  sourceUrl: string, sourcePublishedAt: string, sourceName = '当地统计局/国家统计局调查队', dataNote?: string,
): RunwayBaseline {
  return {
    id, optionLabel: `${name}（市级）`, resultLabel: `按${name}城镇居民平均估算`, sourceRegionName: name,
    regionLevel: 'city', regionGroup: group, dataYear: 2025, annualYuan, metricName: CITY_METRIC,
    sourceName, sourceUrl, sourcePublishedAt, minimumWageMonthlyYuan: wage,
    minimumWageSourceName: MIN_WAGE_SOURCE_NAME, minimumWageSourceUrl: MIN_WAGE_SOURCE_URL,
    minimumWageMethod: `${name}按所在省（市）2025 年最低档月最低工资`, dataNote,
  }
}

function province(
  id: string, name: string, group: Exclude<RegionGroup, '一线城市' | '新一线城市' | '全国'>,
  annualYuan: number, wage: number, sourceUrl: string, sourcePublishedAt: string,
  sourceName = '国家统计局调查队/省统计局', dataNote?: string,
): RunwayBaseline {
  return {
    id, optionLabel: `${name}（省级均值）`, resultLabel: `按${name}城镇居民平均估算`, sourceRegionName: name,
    regionLevel: 'province', regionGroup: group, dataYear: 2025, annualYuan, metricName: PROVINCE_METRIC,
    sourceName, sourceUrl, sourcePublishedAt, minimumWageMonthlyYuan: wage,
    minimumWageSourceName: MIN_WAGE_SOURCE_NAME, minimumWageSourceUrl: MIN_WAGE_SOURCE_URL,
    minimumWageMethod: `${name}使用 2025 年最低档月最低工资`, dataNote,
  }
}

export const RUNWAY_BASELINES: RunwayBaseline[] = [
  // 一线城市：均需工作情景；数据仍是城市统计口径，不是“辞职建议”。
  city('beijing', '北京市', '一线城市', 54122, 2420, 'https://tjj.beijing.gov.cn/zxfbu/202601/t20260121_4451977.html', '2026-01-21', '国家统计局北京调查总队'),
  city('shanghai', '上海市', '一线城市', 57076, 2740, 'https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html', '2026-03-30', '上海市统计局'),
  city('guangzhou', '广州市', '一线城市', 51860, 2500, 'https://tjj.gz.gov.cn/zzfwzq/tjkx/content/post_10804061.html', '2026-05-10', '广州市统计局'),
  city('shenzhen', '深圳市', '一线城市', 53548, 2520, 'https://www.sz.gov.cn/cn/xxgk/zfxxgj/tjsj/tjgb/content/post_12805133.html', '2026-03-02', '深圳市统计局', '深圳城镇化率 99.79%，公报公开值为居民人均消费支出，作为城市近似口径。'),
  // 新一线城市：均需工作情景。
  city('chengdu', '成都市', '新一线城市', 37100, 2330, 'https://www.crei.cn/file/br.aspx?id=20260420165225&op=zc&x=0', '2026-04-20', '成都市统计局'),
  city('chongqing', '重庆市', '新一线城市', 32764, 2330, 'https://tjj.cq.gov.cn/zwgk_233/fdzdgknr/tjxx/sjjd_55469/202603/t20260326_15568538_wap.html', '2026-03-26', '重庆市统计局'),
  city('hangzhou', '杭州市', '新一线城市', 59484, 2490, 'https://www.hzxcw.gov.cn/content_47649.html', '2026-04-29', '杭州市统计局'),
  city('wuhan', '武汉市', '新一线城市', 43233, 2210, 'https://tjj.wuhan.gov.cn/tjfw/tjgb/202604/t20260408_2750693.shtml', '2026-04-09', '武汉市统计局'),
  city('xian', '西安市', '新一线城市', 33665.3, 2160, 'https://tjj.xa.gov.cn/tjsj/tjgb/1.html', '2026-05-15', '西安市统计局'),
  city('suzhou', '苏州市', '新一线城市', 54897, 2490, 'https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml', '2026-04-30', '苏州市统计局'),
  city('zhengzhou', '郑州市', '新一线城市', 35131, 2100, 'https://tjj.zhengzhou.gov.cn/tjgb/10017864.jhtml', '2026-04-15', '郑州市统计局'),
  city('nanjing', '南京市', '新一线城市', 49506, 2490, 'https://www.crei.cn/file/br.aspx?id=20260518090326', '2026-05-18', '南京市统计局'),
  city('tianjin', '天津市', '新一线城市', 39693, 2320, 'https://tjzd.stats.gov.cn/system/2026/01/20/030241179.shtml', '2026-01-20', '国家统计局天津调查总队'),
  city('changsha', '长沙市', '新一线城市', 48547, 2100, 'https://tjj.hunan.gov.cn/hntj/tjfx/tjgb/szgb/zss_1/202605/t20260512_33975356.html', '2026-05-12', '湖南省统计局'),
  city('dongguan', '东莞市', '新一线城市', 43454, 2500, 'https://tjj.dg.gov.cn/zfxxgkml/tjxx/content/post_4537714.html', '2026-05-12', '东莞市统计局'),
  city('ningbo', '宁波市', '新一线城市', 55546, 2490, 'https://zjzd.stats.gov.cn/gjtjjnbdcd/zwgk/xxgkml/dcsj/jdsj/cxjmszqk/art/2026/art_8e7a0c4ec48a4667a9074238cf7be4ca.html', '2026-02-05', '国家统计局宁波调查队'),
  city('foshan', '佛山市', '新一线城市', 46416, 2500, 'https://epaper1.fsonline.com.cn/fsrb/html/2026-06/14/content_71827_329214.htm', '2026-06-14', '佛山市统计局、国家统计局佛山调查队'),
  city('hefei', '合肥市', '新一线城市', 30539, 2060, 'https://www.chinanews.com.cn/cj/2026/03-19/10589656.shtml', '2026-03-19', '安徽省统计局'),
  city('qingdao', '青岛市', '新一线城市', 42391, 2200, 'https://www.crei.cn/file/br.aspx?id=20260414135024&op=zc&x=0', '2026-04-14', '青岛市统计局'),

  // 区域代表省：按用户确认的区域集合，不用省会代替省级均值。
  province('zhejiang', '浙江省', '华东', 53223, 2490, 'https://zjzd.stats.gov.cn/dcsj/ndsj/2025n/cxjmsz/art/2026/art_a1b120a3f44f425cb5639eaa5aca96d9.html', '2026-01-26', '国家统计局浙江调查总队'),
  province('jiangsu', '江苏省', '华东', 43917, 2490, 'https://jszd.stats.gov.cn/TrueCMS//gjtjjjsdczd/2025cxrmshzb/content/60b80fda-ee95-4288-9972-878646d06ab1.html', '2026-02-24', '国家统计局江苏调查总队'),
  province('gansu', '甘肃省', '西北', 29052, 2020, 'https://manage.gsei.com.cn/index.php/cms/item-view-id-659637-page-1', '2026-03-30', '甘肃省统计局、国家统计局甘肃调查总队'),
  province('shaanxi', '陕西省', '西北', 29807, 2160, 'https://www.shaanxi.gov.cn/xw/sxyw/202601/t20260125_3607591.html', '2026-01-25', '陕西省统计局'),
  province('jilin', '吉林省', '东北', 29745, 2120, 'https://tjj.jl.gov.cn/tjsj/tjgb/ndgb/202604/t20260427_3627028.html', '2026-04-27', '吉林省统计局'),
  province('sichuan', '四川省', '西南', 32181, 2330, 'https://www.sczgb.org.cn/sys-nd/3969.html', '2026-03-17', '四川省统计局、国家统计局四川调查总队'),
  province('guizhou', '贵州省', '西南', 29434, 1890, 'https://www.huaon.com/channel/chinadata/1150058.html', '2026-04-01', '贵州省统计局'),
  province('guangdong', '广东省', '华南', 42726, 1750, 'https://gdzd.stats.gov.cn/dcsj/czjmsz/202601/t20260126_182641.html', '2026-01-26', '国家统计局广东调查总队'),
  province('guangxi', '广西壮族自治区', '华南', 27163, 1870, 'https://www.crei.cn/file/br.aspx?id=20260410095408&x=0', '2026-04-10', '广西壮族自治区统计局'),
  province('shandong', '山东省', '华中', 32561, 1820, 'https://tjj.shandong.gov.cn/art/2026/3/3/art_104039_10322510.html?xxgkhide=1', '2026-03-03', '山东省统计局'),
  province('henan', '河南省', '华中', 27319, 1800, 'https://www.huaon.com/channel/chinadata/1150051.html', '2026-04-16', '河南省统计局'),
  province('hunan', '湖南省', '华中', 33678, 1700, 'https://tjj.hunan.gov.cn/hntj/tjfx/tjgb/jjfzgb/202603/t20260325_33940711.html', '2026-03-25', '湖南省统计局'),
  {
    id: 'national_urban', optionLabel: '全国均值（城镇）', resultLabel: '按全国城镇居民平均估算', sourceRegionName: '全国城镇',
    regionLevel: 'national', regionGroup: '全国', dataYear: 2025, annualYuan: 35869, metricName: CITY_METRIC,
    sourceName: '国家统计局', sourceUrl: 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html', sourcePublishedAt: '2026-01-19',
    minimumWageMonthlyYuan: 2248, minimumWageSourceName: MIN_WAGE_SOURCE_NAME, minimumWageSourceUrl: MIN_WAGE_SOURCE_URL,
    minimumWageMethod: '全国最低工资为各省 2025 年最低档标准按城镇人口加权估算，不是国家统一最低工资。',
    dataNote: '全国最低工资加权值为产品估算参数；全国城镇消费支出为国家统计局年度数据。',
  },
]

export function findBaseline(id: string): RunwayBaseline | undefined {
  return RUNWAY_BASELINES.find(b => b.id === id)
}
