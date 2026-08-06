export default function DisclaimerFooter() {
  return (
    <footer className="w-full text-center px-6 pb-10 pt-6">
      <p className="text-[11px] leading-relaxed max-w-sm mx-auto mb-4"
         style={{ color: '#C7C7CC' }}>
        免责声明：PFOS 仅为个人财务信息分析与决策辅助工具。不构成法律意见、财务审计或信贷推荐。所有分析基于用户输入数据，不保证绝对准确。涉及具体协商、诉讼或法律问题时，请咨询专业律师。用户最终决策由其自行承担。
      </p>
      <img src="/企微.jpg" alt="企业微信二维码" className="w-3/5 max-w-[260px] mx-auto" />
    </footer>
  )
}
