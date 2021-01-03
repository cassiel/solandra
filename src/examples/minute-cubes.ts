import { Point2D } from "../lib/types/sol"
import SCanvas from "../lib/sCanvas"
import { Path, SimplePath } from "../lib/paths"
import {
  Hatching,
  Star,
  RegularPolygon,
  Circle,
  Ellipse,
  Rect,
  HollowArc
} from "../lib/paths"
import { add, scale } from "../lib/vectors"
import { perlin2 } from "../lib/noise"
import { LinearGradient, RadialGradient } from "../lib/gradient"
import { zip2, sum, arrayOf } from "../lib/collectionOps"
import { clamp, Line } from "../lib"

const tiling = (p: SCanvas) => {
  p.forTiling({ n: 20, margin: 0.1, type: "square" }, ([x, y], [dX, dY]) => {
    p.setStrokeColor(120 + x * 120 + p.t * 50, 90 - 20 * y, 40)
    p.proportionately([
      [1, () => p.draw(new Line([x, y], [x + dX, y + dY]))],
      [2, () => p.draw(new Line([x + dX, y], [x, y + dY]))],
    ])
  })
}

const starterRect = (p: SCanvas) => {
  p.lineWidth = 0.002
  p.setStrokeColor(0, 0, 50)
  p.background(0, 0, 0)
  const { right, bottom } = p.meta

  new Rect({ at: [0.1, 0.1], w: right - 0.2, h: bottom - 0.2 })
    .split({ orientation: "vertical", split: [1, 1.5, 2, 2.5] })
    .forEach((r, i) => {
      p.setFillGradient(
        new LinearGradient({
          from: r.at,
          to: [r.at[0], r.at[1] + r.h],
          colors: [
            [0, { h: i * 30, s: 90, l: 20 }],
            [1, { h: i * 30, s: 60, l: 10 }],
          ],
        })
      )
      p.fill(r)
      p.draw(r)
    })
}

const myArcs = (p: SCanvas) => {
  const bgLightness = p.uniformRandomInt({from: 15, to: 85})
  const repeats = p.uniformRandomInt({from: 80, to: 120})
  const spotHue1 = p.random() * 360
  //const spotHue2 = p.random() * 360
  const spotHue2 = (spotHue1 + p.sample([20, 120, 180, 240])) % 360
  const spotColourChance = p.random() * 0.5

  p.background(spotHue1, 30 * p.random(), bgLightness)

  // Wide arcs:
  p.times(100, () => {
    const a1 = p.random() * Math.PI * 2
    const a2 = a1 + p.gaussian({ mean: 0.4, sd: 0.5 })
    const a_mid = (a1 + a2) / 2
    const r1 = p.sample(
      [0.2, 0.25, 0.3, 0.35, 0.4, 0.45].map(n => n - 0.05 + p.random() * 0.1)
    )
    const r2 = Math.max(r1 - 0.5 * (0.5 - r1) * p.random(), 0)

    //  Calculate points for gradient: inner and outer arc edge centres:
    //const gradPoint1 = [0.5, 0.5]       //  Centre
    const gradPoint1: Point2D = [
      0.5 + r1 * Math.cos(a_mid),
      0.5 + r1 * Math.sin(a_mid)
    ]
    const gradPoint2: Point2D = [
      0.5 + r2 * Math.cos(a_mid),
      0.5 + r2 * Math.sin(a_mid)
    ]

    //p.setFillColor(p.sample([20, 30, 35, 200]), 90, 60, 0.3)
    //p.setFillColor(0, 100, 30)
    //p.fill(new Circle({at: gradPoint1, r: 0.01}))   //  TODO: get round the types?

    //p.setFillColor(180, 100, 30)
    //p.fill(new Circle({at: gradPoint2, r: 0.01}))

    // Slightly randomise lightness for the gradient:
    const lightness0 = p.uniformRandomInt({from: 10, to: 60})
    const lightness1 = lightness0 + 40

    const hue = p.sample([spotHue1, spotHue2])
    const spotting = (p.random() < spotColourChance)
    const saturation1 = (spotting ? 50 : 0)
    const saturation2 = (spotting ? 100 : 0)

    p.setFillGradient(
      new LinearGradient({
        from: gradPoint1,
        to: gradPoint2,
        colors: [
          [0, { h: hue, s: saturation1, l: lightness0, a: 0.4 + p.random() * 0.2}],
          [1, { h: hue, s: saturation2, l: lightness1, a: 0.7 + p.random() * 0.3}]
        ]
      })
    )

    p.fill(
      new HollowArc({
        at: p.meta.center,
        a: a1,
        a2,
        r: r1,
        r2
      })
    )

    if (true) {
      p.setFillColor(hue, saturation1 - 20, lightness0 - 3, 0.5)
      p.fill(
        new HollowArc({
          at: p.meta.center,
          a: a1,
          a2: a2,
          r: r1,
          r2: r1 + 0.002
        })
      )
    }
  })

}

const sketches: { name: string; sketch: (p: SCanvas) => void }[] = [
  { sketch: tiling, name: "Tiling" },
  { sketch: starterRect, name: "Starter Rectangle"},
  { sketch: myArcs, name: "My Arcs"}
]

export default sketches
