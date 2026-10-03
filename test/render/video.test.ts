import { describe, it, expect } from 'vitest'
import { bitrateFor } from '../../src/render/video-fast'
import {
  VIDEO_FPS,
  buildVideoFilename,
  coverRect,
  coverageFrame,
  opaqueBounds,
  pickContainer,
} from '../../src/render/video'

/*
 * 這裡測的是影片匯出裡「不需要版面引擎也能判斷對錯」的那幾塊。逐幀合成本身
 * 要真的瀏覽器才跑得起來（happy-dom 沒有 canvas、沒有 MediaRecorder），那一段
 * 是用無頭 Chromium 跑完整條路驗的。
 */

describe('pickContainer', () => {
  it('拿得到 MP4 就不要 WebM —— iOS 相簿存不進 WebM，IG 與 Threads 也不收', () => {
    expect(pickContainer(() => true)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
  })

  it('只支援 WebM 時退而求其次，而不是放棄', () => {
    expect(pickContainer((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus')
  })

  it('偏好含音訊編碼的那一個 —— 少了它錄出來會是默片', () => {
    const chosen = pickContainer(() => true)
    expect(chosen).toContain('mp4a')
  })

  it('一個都不支援時回空字串，交給瀏覽器自己決定，而不是直接失敗', () => {
    expect(pickContainer(() => false)).toBe('')
  })

  /* 「能不能錄」是 canRecordVideo 的事。兩件事混在一起的話，這裡注入的替身
     會被那個檢查架空，整組斷言就變成在驗一個永遠回 null 的函式。 */
  it('沒有 MediaRecorder 的環境也照樣照替身的話做 —— 判斷不混在一起', () => {
    expect(typeof MediaRecorder).toBe('undefined')
    expect(pickContainer(() => true)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
  })

  it('isTypeSupported 丟例外時當作不支援，不會把整個匯出帶下去', () => {
    expect(pickContainer((t) => {
      if (t.includes('avc1')) throw new Error('nope')
      return t === 'video/webm'
    })).toBe('video/webm')
  })
})

/*
 * 卡片上的圖是 object-fit: cover + object-position: 50% Y% 擺的。影片必須用
 * 同一套算法填進同一個框，否則同一則貼文存成圖片跟存成影片會裁在不同的地方
 * —— 使用者看得出來不一樣，卻說不上來哪裡怪。
 */
describe('coverRect', () => {
  const box = { x: 100, y: 200, width: 400, height: 400 }

  it('橫幅來源：填滿高度，左右溢出，水平置中', () => {
    const r = coverRect(box, { width: 1280, height: 720 }, 50)
    expect(r.height).toBe(400)
    expect(r.width).toBeCloseTo(400 * (1280 / 720), 5)
    expect(r.x + r.width / 2).toBeCloseTo(box.x + box.width / 2, 5)
  })

  it('直式來源：填滿寬度，上下溢出', () => {
    const r = coverRect(box, { width: 720, height: 1280 }, 50)
    expect(r.width).toBe(400)
    expect(r.height).toBeCloseTo(400 * (1280 / 720), 5)
  })

  it('focusY 決定捨棄的是上面還是下面', () => {
    const top = coverRect(box, { width: 720, height: 1280 }, 0)
    const middle = coverRect(box, { width: 720, height: 1280 }, 50)
    const bottom = coverRect(box, { width: 720, height: 1280 }, 100)
    expect(top.y).toBe(box.y)
    expect(bottom.y + bottom.height).toBeCloseTo(box.y + box.height, 5)
    expect(middle.y).toBeLessThan(top.y + 1)
    expect(middle.y).toBeGreaterThan(bottom.y)
  })

  it('預設偏上 —— 卡片的預設值小於 50，主體通常在上半部', () => {
    const r = coverRect(box, { width: 720, height: 1280 }, 30)
    const centred = coverRect(box, { width: 720, height: 1280 }, 50)
    expect(r.y).toBeGreaterThan(centred.y)
  })

  it('比例一樣時剛好填滿，不多不少', () => {
    const r = coverRect(box, { width: 800, height: 800 }, 50)
    expect([r.x, r.y, r.width, r.height]).toEqual([box.x, box.y, box.width, box.height])
  })

  it('來源尺寸還沒解出來時原樣回傳，不會算出 Infinity 或 NaN', () => {
    expect(coverRect(box, { width: 0, height: 0 }, 50)).toEqual(box)
  })
})

/*
 * 影片框的位置不是算出來的，是從「只留下封面圖、其餘全部 visibility: hidden」
 * 的那張光柵化結果量出來的 —— 面板放不下時會整個 transform: scale()，用
 * offsetLeft 去算會在「長貼文加影片」這個組合下悄悄偏掉。
 */
describe('opaqueBounds', () => {
  const plate = (width: number, height: number, fill: (x: number, y: number) => number) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = fill(x, y)
    }
    return data
  }

  it('框住不透明的那一塊，含頭含尾', () => {
    const data = plate(20, 20, (x, y) => (x >= 4 && x <= 9 && y >= 2 && y <= 7 ? 255 : 0))
    expect(opaqueBounds(data, 20, 20)).toEqual({ x: 4, y: 2, width: 6, height: 6 })
  })

  it('半透明的邊緣也算 —— 圓角的反鋸齒就在那裡，切掉會露出一圈', () => {
    const data = plate(10, 10, (x, y) => (x === 5 && y === 5 ? 1 : 0))
    expect(opaqueBounds(data, 10, 10)).toEqual({ x: 5, y: 5, width: 1, height: 1 })
  })

  it('整張全透明時回 null —— 那代表卡片上根本沒有影片框', () => {
    expect(opaqueBounds(plate(8, 8, () => 0), 8, 8)).toBeNull()
  })

  it('滿版時就是整張', () => {
    expect(opaqueBounds(plate(6, 4, () => 255), 6, 4)).toEqual({ x: 0, y: 0, width: 6, height: 4 })
  })
})

/*
 * opaqueBounds 把反鋸齒的半透明邊也算進去；拿它決定影片要放多大，寬高比會被
 * 拉偏，cover 就在另一個方向裁掉幾個像素。實測 9:16 卡片裡一支 9:16 的影片，
 * 上緣被裁掉 5px —— 圖框明明已經是影片自己的比例。
 */
describe('coverageFrame', () => {
  /** 一個實心矩形，四邊各有一格給定 alpha 的反鋸齒邊。 */
  const framed = (width: number, height: number, inner: { x: number; y: number; w: number; h: number }, edge: number) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = inner.y - 1; y <= inner.y + inner.h; y++) {
      for (let x = inner.x - 1; x <= inner.x + inner.w; x++) {
        const inside = x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h
        data[(y * width + x) * 4 + 3] = inside ? 255 : edge
      }
    }
    return data
  }

  it('扣掉半透明的邊，量出圖框真正的邊', () => {
    const data = framed(40, 60, { x: 10, y: 10, w: 18, h: 32 }, 128)
    const box = opaqueBounds(data, 40, 60)!
    expect(box).toEqual({ x: 9, y: 9, width: 20, height: 34 })
    const frame = coverageFrame(data, 40, box)
    expect(frame.x).toBeCloseTo(9 + (1 - 128 / 255), 5)
    expect(frame.width).toBeCloseTo(18 + 2 * (128 / 255), 5)
    expect(frame.height).toBeCloseTo(32 + 2 * (128 / 255), 5)
  })

  it('比例因此回到圖框自己的比例 —— 這正是 cover 不再多裁的原因', () => {
    const data = framed(60, 100, { x: 10, y: 10, w: 36, h: 64 }, 1)
    const box = opaqueBounds(data, 60, 100)!
    const frame = coverageFrame(data, 60, box)
    expect(box.width / box.height).not.toBeCloseTo(36 / 64, 2)
    expect(frame.width / frame.height).toBeCloseTo(36 / 64, 2)
    const fit = coverRect(frame, { width: 360, height: 640 }, 0)
    expect(fit.height - frame.height).toBeLessThan(0.5)
    expect(fit.width - frame.width).toBeLessThan(0.5)
  })

  it('沒有反鋸齒時就是原本的範圍', () => {
    const data = framed(20, 20, { x: 5, y: 5, w: 8, h: 8 }, 0)
    const box = opaqueBounds(data, 20, 20)!
    expect(coverageFrame(data, 20, box)).toEqual(box)
  })

  it('整條中線都是半透明時量不出邊，原樣回傳', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let i = 3; i < data.length; i += 4) data[i] = 100
    const box = opaqueBounds(data, 10, 10)!
    expect(coverageFrame(data, 10, box)).toEqual(box)
  })
})

describe('buildVideoFilename', () => {
  it('MP4 就給 .mp4', () => {
    expect(buildVideoFilename('x-jack-20.png', 'video/mp4;codecs=avc1')).toBe('x-jack-20.mp4')
  })

  it('退到 WebM 時副檔名要跟著換 —— 名實不符的檔案在 iOS 上會更難查', () => {
    expect(buildVideoFilename('x-jack-20.png', 'video/webm;codecs=vp9')).toBe('x-jack-20.webm')
  })

  it('沒有 .png 結尾也不會壞', () => {
    expect(buildVideoFilename('x-jack-20', 'video/mp4')).toBe('x-jack-20.mp4')
  })
})

describe('VIDEO_FPS', () => {
  it('30 —— 高於它只是讓檔案變大，社群平台一律會壓回去', () => {
    expect(VIDEO_FPS).toBe(30)
  })
})

describe('bitrateFor', () => {
  it('1080×1920 / 30fps 約 6 Mbps —— 社群平台重壓之前看不出差別的分水嶺', () => {
    expect(bitrateFor(1080, 1920)).toBeCloseTo(6_220_800, -5)
  })

  it('小畫面不會低到糊掉', () => {
    expect(bitrateFor(320, 240)).toBe(2_000_000)
  })

  it('大畫面有上限 —— 再高只是讓上傳變慢，平台照樣壓回去', () => {
    expect(bitrateFor(3840, 2160)).toBe(12_000_000)
  })

  it('跟著像素數走，不是跟著某一邊', () => {
    expect(bitrateFor(1080, 1080)).toBeLessThan(bitrateFor(1080, 1920))
  })
})
