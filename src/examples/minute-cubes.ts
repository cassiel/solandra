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
  HollowArc,
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

const sketches: { name: string; sketch: (p: SCanvas) => void }[] = [
  { sketch: tiling, name: "Tiling" },
]

export default sketches
