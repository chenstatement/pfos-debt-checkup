import { Link } from 'react-router-dom'
import './PiosHome.css'
type PortalModule = [id: string, name: string, label: string, description: string, href?: string]
const modules: PortalModule[] = [
  ['01','PFOS','财务体检','看清财务结构，形成可执行的行动计划。','/pfos'],
  ['02','Family Health','家庭健康','整理健康档案，连接日常观察与照护行动。','https://family-health-console.shawn-chan.chatgpt.site'],
  ['03','Thinking Engine','思维引擎','观察、建模、推理、表达，训练判断与行动。'],['04','VLE','词语解析','从词义到语境，拆解概念并建立连接。'],['05','Movement Engine','运动精进','围绕训练、动作与恢复，持续打磨身体能力。'],
  ['06','昨今明后','行动与日程','收集随手记，盘点进展，明确下一步行动。','https://yesterday-today-tomorrow.shawn-chan.chatgpt.site'],['07','DNOS','协商与决策','整理事实与材料，梳理选项及决策依据。'],
]
export default function PiosHome() {
  return <main className="pios-portal"><a className="pios-portal__skip" href="#pios-systems">跳到系统入口</a><div className="pios-portal__shell">
    <header className="pios-portal__header"><a className="pios-portal__brand" href="/" aria-label="陈述式科技 PIOS 入口首页"><img src="/pios/chenshushi-logo.jpeg" width="230" height="77" alt="陈述式科技" /></a><p>个人系统索引 / PIOS</p></header>
    <section className="pios-portal__intro" aria-labelledby="pios-title"><div className="pios-portal__identity"><p className="pios-portal__eyebrow">Shawn's personal operating system</p><p className="pios-portal__identity-name">歪墙 <span>/ Shawn</span></p><p>陈述，即创造。</p><small>AI Native · 持续生长 · 连接行动</small></div><div><p className="pios-portal__index">00 / 入口总览</p><h1 id="pios-title">把生活，写成自己的系统。</h1><p className="pios-portal__lede">以 AI Native 为底层方法，把财务、健康、思考、语言、运动与行动，连接成持续生长的 PIOS。</p></div></section>
    <section className="pios-portal__systems" id="pios-systems" aria-labelledby="pios-systems-title">
      <div className="pios-portal__heading"><div><p className="pios-portal__index">01 / Core modules</p><h2 id="pios-systems-title">系统入口</h2></div><p>七个视角，一套持续迭代的生活操作系统。</p></div>
      <div className="pios-portal__grid">{modules.map(([id, name, label, description, href]) => {
        const external = href?.startsWith('https://')
        const content = <>
          <div className="pios-portal__topline"><span>{id}</span><span className={href ? 'pios-portal__status pios-portal__status--available' : 'pios-portal__status'}>{external ? '需授权 · 新窗口' : href ? '本站工具' : '入口待接入'}</span></div>
          <h3>{name}<span>{label}</span></h3><p>{description}</p>
          <span className="pios-portal__link">{external ? '访问系统 ↗' : href ? '进入 PFOS →' : '地址确认后开放'}</span>
        </>
        if (external) return <a key={id} className="pios-portal__card pios-portal__card--featured" href={href} target="_blank" rel="noopener noreferrer">{content}</a>
        if (href) return <Link key={id} className="pios-portal__card pios-portal__card--featured" to={href}>{content}</Link>
        return <article key={id} className="pios-portal__card">{content}</article>
      })}</div>
    </section>
    <footer className="pios-portal__footer"><p>入口连接，数据留在各自系统。健康与日程内容仅在原系统授权后访问。</p><p>PFOS 数据仍保留在你的浏览器本地。</p></footer>
  </div></main>
}
