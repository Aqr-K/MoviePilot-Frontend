import { root, useInitData, useState } from '@lynx-js/react'

/** 点击标题切换详情，三端读取同一份插件初始数据。 */
function PluginPage() {
  const { title, details } = useInitData() as { title: string; details: string }
  const [expanded, setExpanded] = useState(false)
  return (
    <view style={{ padding: '16px', backgroundColor: '#f2f5fa' }}>
      <view
        accessibility-element={true}
        accessibility-label={title}
        accessibility-trait='button'
        bindtap={() => setExpanded(!expanded)}
      >
        <text style={{ fontSize: '20px', color: '#182431' }}>{title}</text>
      </view>
      {expanded && (
        <text accessibility-element={true} accessibility-label={details} style={{ color: '#354962' }}>
          {details}
        </text>
      )}
    </view>
  )
}

root.render(<PluginPage />)
