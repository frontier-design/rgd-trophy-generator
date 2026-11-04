import { createCanvas } from 'canvas'
import { bannerLayout } from '../../src/banner'
import { drawComposition } from '../../src/export'

describe('drawComposition', () => {
  it('fills the background and draws images and text at the output scale', () => {
    const canvas = createCanvas(200, 100)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const image = createCanvas(10, 10)
    const imageCtx = image.getContext('2d')
    imageCtx.fillStyle = '#ff0000'
    imageCtx.fillRect(0, 0, 10, 10)

    drawComposition(
      ctx,
      {
        width: 100,
        height: 50,
        background: '#0000ff',
        images: [
          { image: image as unknown as CanvasImageSource, x: 10, y: 10, width: 10, height: 10 },
        ],
        text: [],
      },
      2,
    )
    const pixel = (x: number, y: number) =>
      Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data)
    // Background everywhere, scaled ×2 to fill 200 × 100.
    expect(pixel(199, 99)).toEqual([0, 0, 255, 255])
    // The image at (10, 10)–(20, 20) in artboard px → (20, 20)–(40, 40) in output px.
    expect(pixel(30, 30)).toEqual([255, 0, 0, 255])
    expect(pixel(45, 30)).toEqual([0, 0, 255, 255])
  })

  it('draws each text line at its baseline, left or right aligned', () => {
    const canvas = createCanvas(200, 100)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const calls: Array<[string, number, number, string]> = []
    const fillText = ctx.fillText.bind(ctx)
    ctx.fillText = (text: string, x: number, y: number) => {
      calls.push([text, x, y, ctx.textAlign])
      fillText(text, x, y)
    }
    drawComposition(
      ctx,
      {
        width: 200,
        height: 100,
        background: '#ffffff',
        images: [],
        text: [
          {
            lines: ['RGD', 'AWARDS'],
            baselines: [20, 40],
            x: 5,
            align: 'left',
            font: '10px sans-serif',
            color: '#000',
          },
          {
            lines: ['RGD'],
            baselines: [20],
            x: 190,
            align: 'right',
            font: '10px sans-serif',
            color: '#000',
          },
        ],
      },
      1,
    )
    expect(calls).toEqual([
      ['RGD', 5, 20, 'left'],
      ['AWARDS', 5, 40, 'left'],
      ['RGD', 190, 20, 'right'],
    ])
  })

  it('draws the banner over everything: its bar, once revealed', () => {
    const canvas = createCanvas(192, 108)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const layout = bannerLayout({
      frameWidth: 192,
      frameHeight: 108,
      margin: 5,
      position: 'bottom',
      headlineWidth: 60,
      linkWidth: 50,
    })
    const draw = (reveal: number) =>
      drawComposition(
        ctx,
        {
          width: 192,
          height: 108,
          background: '#ff0000',
          images: [],
          text: [],
          banner: {
            layout,
            reveal,
            stagger: 0.2,
            headline: '',
            link: '',
            fontFamily: 'sans-serif',
            textColor: '#000000',
            background: '#ffffff',
            logo: null,
          },
        },
        1,
      )
    const pixel = (x: number, y: number) =>
      Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data)
    const inBar = Math.floor(layout.bar.y + layout.bar.height / 2)
    draw(0)
    expect(pixel(100, inBar)).toEqual([255, 0, 0, 255])
    draw(1)
    // The bar's background covers the frame.
    expect(pixel(100, inBar)).toEqual([255, 255, 255, 255])
  })

  it('draws typed letters right-aligned at where each ends, so kerning is kept', () => {
    const canvas = createCanvas(200, 100)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const calls: Array<[string, number, string]> = []
    const fillText = ctx.fillText.bind(ctx)
    ctx.fillText = (text: string, x: number, y: number) => {
      calls.push([text, x, ctx.textAlign])
      fillText(text, x, y)
    }
    drawComposition(
      ctx,
      {
        width: 200,
        height: 100,
        background: '#ffffff',
        images: [],
        text: [
          {
            lines: ['AW'],
            baselines: [40],
            x: 10,
            offsets: [5],
            glyphs: [
              [
                { char: 'A', x: 12 },
                { char: 'W', x: 30 },
              ],
            ],
            align: 'left',
            font: '10px sans-serif',
            color: '#000',
          },
        ],
      },
      1,
    )
    expect(calls).toEqual([
      ['A', 27, 'right'],
      ['W', 45, 'right'],
    ])
  })
})

describe('image export', () => {
  it('caps the scale so a frame stays renderable', async () => {
    const { maxImageScale } = await import('../../src/export')
    expect(maxImageScale(1920, 1080)).toBe(5)
    expect(maxImageScale(3840, 2160)).toBe(3)
    expect(maxImageScale(8192, 8192)).toBe(1)
  })

  it('leaves the background out of a transparent composition', async () => {
    const { drawComposition } = await import('../../src/export')
    const calls: string[] = []
    const ctx = {
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      fillRect: () => calls.push('fill'),
      clearRect: () => calls.push('clear'),
      drawImage: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      set fillStyle(_v: string) {},
    } as unknown as CanvasRenderingContext2D
    drawComposition(ctx, { width: 10, height: 10, background: null, images: [], text: [] }, 1)
    expect(calls).toEqual(['clear'])
  })
})
