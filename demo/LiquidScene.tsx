import { useState } from 'react'
import { LiquidSegmented } from './LiquidSegmented'
import { LiquidSlider } from './LiquidSlider'
import { LiquidSearch } from './LiquidSearch'
import { SunIcon } from './icons'
import { LiquidHero } from './LiquidHero'

const SEGMENTS = ['Day', 'Week', 'Month', 'Year']

export function LiquidScene() {
  const [sel, setSel] = useState(1)
  const [brightness, setBrightness] = useState(0.64)

  return (
    <>
      <LiquidHero />

      <div className="liquid-intro">
        <h2>Liquid</h2>
        <p>Grab a drop · drag the indicator · grab the slider · tap search or pull the button</p>
      </div>

      <LiquidSegmented className="seg" items={SEGMENTS} value={sel} onChange={setSel} height={56} />

      <div className="slider-row">
        <div className="slider-head">
          <span>
            <SunIcon size={16} /> Brightness
          </span>
          <output>{Math.round(brightness * 100)}%</output>
        </div>
        <LiquidSlider label="Brightness" value={brightness} onChange={setBrightness} />
      </div>

      <div className="search-row">
        <LiquidSearch />
      </div>
    </>
  )
}
