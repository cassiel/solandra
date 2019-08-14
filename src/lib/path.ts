import { Point2D, Vector2D } from "./types/sol"
import v from "./vectors"
import { tripleWise } from "./collectionOps"
import { centroid } from "./util"

export interface Traceable {
  traceIn(ctx: CanvasRenderingContext2D)
}

export interface Textable {
  textIn(ctx: CanvasRenderingContext2D)
}

export class SimplePath implements Traceable {
  private constructor(private points: Point2D[] = []) {}

  static startAt(point: Point2D): SimplePath {
    return new SimplePath([point])
  }

  static withPoints(points: Point2D[]): SimplePath {
    return new SimplePath(points)
  }

  addPoint(point: Point2D): SimplePath {
    this.points.push(point)
    return this
  }

  close(): SimplePath {
    if (this.points[0]) this.points.push(this.points[0])
    return this
  }

  /**
   * Smooth out path by adding more points to give curvy result
   * @param iterations
   */
  chaiken({
    n = 1,
    looped = false,
  }: {
    n: number
    looped?: boolean
  }): SimplePath {
    for (let i = 0; i < n; i++) {
      this.points = (looped ? [] : this.points.slice(0, 1))
        .concat(
          tripleWise(this.points, looped).flatMap(([a, b, c]) => [
            v.pointAlong(b, a, 0.25),
            v.pointAlong(b, c, 0.25),
          ])
        )
        .concat(looped ? [] : this.points.slice(this.points.length - 1))
        .slice(looped ? 1 : 0)
    }
    if (looped) this.points[0] = this.points[this.points.length - 1]
    return this
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    const from = this.points[0]
    ctx.moveTo(...from)
    for (let point of this.points.slice(1)) {
      ctx.lineTo(...point)
    }
  }

  /**
   * @param delta Vector to move path by
   */
  moved(delta: Vector2D): SimplePath {
    return this.transformed(pt => v.add(pt, delta))
  }

  scaled(scale: number): SimplePath {
    const c = this.centroid
    return this.transformed(p => v.add(c, v.scale(v.subtract(p, c), scale)))
  }

  /**
   * Warning mutates
   * @param delta Vector to move path by
   */
  transformPoints(transform: (point: Point2D) => Point2D): SimplePath {
    this.points = this.points.map(transform)
    return this
  }

  get reversed(): SimplePath {
    return new SimplePath(this.points.slice().reverse())
  }

  get centroid(): Point2D {
    return centroid(this.points)
  }

  /**
   * Split the path into triangular segments, around the centroid
   */
  get segmented(): SimplePath[] {
    const c = this.centroid
    if (this.points.length < 2) throw new Error("Must have at least 2 points")
    const n = this.points.length - 1
    const paths: SimplePath[] = []
    for (let i = 0; i < n; i++) {
      paths.push(
        SimplePath.withPoints([
          this.points[i],
          this.points[i + 1],
          c,
          this.points[i],
        ])
      )
    }
    return paths
  }

  /**
   * Split the path into triangular segments, around the centroid.
   * displaced by magnitude and scaled by scale
   */
  exploded(config: { magnitude?: number; scale?: number } = {}): SimplePath[] {
    const { magnitude = 1.2, scale = 1 } = config
    const c = this.centroid
    if (this.points.length < 2) throw new Error("Must have at least 2 points")
    const n = this.points.length - 1
    const paths: SimplePath[] = []
    for (let i = 0; i < n; i++) {
      const newPath = SimplePath.withPoints([
        this.points[i],
        this.points[i + 1],
        c,
        this.points[i],
      ]).scaled(scale)
      const npc = newPath.centroid
      const displacement = v.scale(v.subtract(npc, c), magnitude - 1.0)
      paths.push(newPath.moved(displacement))
    }
    return paths
  }

  transformed(transform: (point: Point2D) => Point2D): SimplePath {
    return new SimplePath(this.points.map(transform))
  }

  withAppended(other: SimplePath): SimplePath {
    return new SimplePath(this.points.concat(other.points))
  }

  rotated(angle: number): SimplePath {
    const c = this.centroid
    const [cX, cY] = c
    return this.transformed(pt => {
      const [dX, dY] = v.subtract(pt, c)
      return [
        cX + Math.cos(angle) * dX - Math.sin(angle) * dY,
        cY + Math.sin(angle) * dX + Math.cos(angle) * dY,
      ]
    })
  }

  subdivide(config: { m: number; n: number }): SimplePath[] {
    const l = this.points.length
    const { n, m } = config
    if (m > n || n >= l || m >= l || n < 0 || m < 0)
      new Error(
        "Requires two indices, ordered, each less than the total points in this path"
      )
    const p1 = [...this.points.slice(m, n + 1), this.points[m]]
    const p2 = [
      ...this.points.slice(n - 1),
      ...this.points.slice(0, m + 1),
      this.points[n],
    ]
    return [SimplePath.withPoints(p1), SimplePath.withPoints(p2)]
  }
}

type PathEdge =
  | { kind: "line"; from: Point2D; to: Point2D }
  | {
      kind: "cubic"
      from: Point2D
      to: Point2D
      control1: Point2D
      control2: Point2D
    }

type CurveConfig = {
  polarlity?: 1 | -1
  curveSize?: number
  curveAngle?: number
  bulbousness?: number
  twist?: number
}

export class Path implements Traceable {
  private currentPoint: Point2D
  private edges: PathEdge[] = []

  private constructor(startPoint: Point2D) {
    this.currentPoint = startPoint
  }

  static startAt(point: Point2D): Path {
    return new Path(point)
  }

  addLineTo = (point: Point2D): Path => {
    this.edges.push({
      kind: "line",
      from: this.currentPoint,
      to: point,
    })
    this.currentPoint = point
    return this
  }

  addCurveTo = (point: Point2D, config: CurveConfig = {}): Path => {
    const {
      curveSize = 1,
      polarlity = 1,
      bulbousness = 1,
      curveAngle = 0,
      twist = 0,
    } = config

    const u = v.subtract(point, this.currentPoint)
    const d = v.magnitude(u)
    const m = v.add(this.currentPoint, v.scale(u, 0.5))
    const perp = v.normalise(v.rotate(u, -Math.PI / 2))
    const rotatedPerp = v.rotate(perp, curveAngle)
    const controlMid = v.add(
      m,
      v.scale(rotatedPerp, curveSize * polarlity * d * 0.5)
    )
    const perpOfRot = v.normalise(v.rotate(rotatedPerp, -Math.PI / 2 - twist))

    const control1 = v.add(
      controlMid,
      v.scale(perpOfRot, (bulbousness * d) / 2)
    )
    const control2 = v.add(
      controlMid,
      v.scale(perpOfRot, (-bulbousness * d) / 2)
    )

    this.edges.push({
      kind: "cubic",
      control1,
      control2,
      to: point,
      from: this.currentPoint,
    })
    this.currentPoint = point
    return this
  }

  /**
   * @param delta Vector to move path by
   */
  moved(delta: Vector2D): Path {
    return this.transformed(pt => v.add(pt, delta))
  }

  scaled(scale: number): Path {
    const c = this.centroid
    return this.transformed(p => v.add(c, v.scale(v.subtract(p, c), scale)))
  }

  get reversed(): Path {
    const newPath = new Path(this.currentPoint)
    const newEdges = this.edges.map(
      (e: PathEdge): PathEdge => {
        switch (e.kind) {
          case "line":
            return { kind: "line", from: e.to, to: e.from }
          case "cubic":
            return {
              kind: "cubic",
              from: e.to,
              to: e.from,
              control1: e.control2,
              control2: e.control1,
            }
        }
      }
    )
    newPath.edges = newEdges
    return newPath
  }

  get centroid(): Point2D {
    return centroid(this.edges.map(e => e.from))
  }

  /**
   * Split the path into triangular segments, around the centroid
   */
  get segmented(): Path[] {
    const c = this.centroid
    if (this.edges.length < 2) throw new Error("Must have at least 2 edges")
    const n = this.edges.length
    const paths: Path[] = []
    for (let e of this.edges) {
      const newPath = new Path(e.to)
      newPath.edges = [e]
      newPath.addLineTo(c)
      newPath.addLineTo(e.from)
      paths.push(newPath)
    }
    return paths
  }

  /**
   * Split the path into triangular segments, around the centroid.
   * displaced by magnitude and scaled by scale
   */
  exploded(config: { magnitude?: number; scale?: number } = {}): Path[] {
    const { magnitude = 1.2, scale = 1 } = config
    const c = this.centroid
    if (this.edges.length < 2) throw new Error("Must have at least 2 edges")
    const paths: Path[] = []
    for (let e of this.edges) {
      const newPath = new Path(e.to)
      newPath.edges = [e]
      newPath.addLineTo(c)
      newPath.addLineTo(e.from)
      const snp = newPath.scaled(scale)
      const npc = snp.centroid
      const displacement = v.scale(v.subtract(npc, c), magnitude - 1.0)
      paths.push(snp.moved(displacement))
    }
    return paths
  }

  transformed(transform: (point: Point2D) => Point2D): Path {
    const newPath = new Path(this.currentPoint)

    newPath.edges = this.edges.map(
      (e): PathEdge => {
        switch (e.kind) {
          case "cubic":
            return {
              kind: "cubic",
              from: transform(e.from),
              to: transform(e.to),
              control1: transform(e.control1),
              control2: transform(e.control2),
            }
          case "line":
            return {
              kind: "line",
              from: transform(e.from),
              to: transform(e.to),
            }
        }
      }
    )
    return newPath
  }

  rotated(angle: number): Path {
    const c = this.centroid
    const [cX, cY] = c
    return this.transformed(pt => {
      const [dX, dY] = v.subtract(pt, c)
      return [
        cX + Math.cos(angle) * dX - Math.sin(angle) * dY,
        cY + Math.sin(angle) * dX + Math.cos(angle) * dY,
      ]
    })
  }

  subdivide(config: { m: number; n: number; curve?: CurveConfig }): Path[] {
    const l = this.edges.length
    const { n, m } = config
    if (m > n || n >= l || m >= l || n < 0 || m < 0)
      new Error(
        "Requires two indices, ordered, each less than the total edges in this path"
      )
    const es1 = this.edges.slice(m, n)
    const es2 = [...this.edges.slice(n), ...this.edges.slice(0, m)]

    if (config.curve) {
      const path1 = new Path(es1[es1.length - 1].to)
      const path2 = new Path(es2[es2.length - 1].to)

      path1.edges = es1
      path2.edges = es2

      const polarlity: 1 | -1 = (config.curve && config.curve.polarlity) || 1

      path1.addCurveTo(es1[0].from, config.curve)
      path2.addCurveTo(es2[0].from, {
        ...config.curve,
        polarlity: -polarlity as (1 | -1),
      })

      return [path1, path2]
    } else {
      es1.push({ to: es1[0].from, from: es1[es1.length - 1].to, kind: "line" })
      es2.push({ from: es1[0].from, to: es1[es1.length - 1].to, kind: "line" })
      const path1 = new Path(es1[es1.length - 1].to)
      path1.edges = es1
      const path2 = new Path(es2[es2.length - 1].to)
      path2.edges = es2

      return [path1, path2]
    }
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    const { from } = this.edges[0]
    ctx.moveTo(...from)
    for (let edge of this.edges) {
      switch (edge.kind) {
        case "line":
          ctx.lineTo(...edge.to)
          break
        case "cubic": {
          const { to, control1, control2 } = edge
          ctx.bezierCurveTo(
            control1[0],
            control1[1],
            control2[0],
            control2[1],
            to[0],
            to[1]
          )
          break
        }
      }
    }
  }
}

export class CompoundPath implements Traceable {
  private constructor(private paths: Traceable[]) {}

  static withPaths(...paths: Traceable[]) {
    return new CompoundPath(paths)
  }

  traceIn(ctx: CanvasRenderingContext2D) {
    this.paths.forEach(p => p.traceIn(ctx))
  }
}

export class Arc implements Traceable {
  readonly cX: number
  readonly cY: number
  readonly radius: number
  readonly startAngle: number
  readonly endAngle: number
  readonly antiClockwise: boolean

  constructor(config: { at: Point2D; r: number; a: number; a2: number }) {
    const {
      at: [cX, cY],
      r,
      a,
      a2,
    } = config
    const antiClockwise = a > a2

    this.cX = cX
    this.cY = cY
    this.radius = r
    this.startAngle = a
    this.endAngle = a2
    this.antiClockwise = antiClockwise
  }
  traceIn = (ctx: CanvasRenderingContext2D) => {
    if (Math.abs(this.startAngle - this.endAngle) > 0.0001)
      ctx.moveTo(this.cX, this.cY)

    ctx.arc(
      this.cX,
      this.cY,
      this.radius,
      this.startAngle,
      this.endAngle,
      this.antiClockwise
    )
    if (this.startAngle - this.endAngle > 0.0001) ctx.lineTo(this.cX, this.cX)
  }
}

export class HollowArc implements Traceable {
  readonly cX: number
  readonly cY: number
  readonly radius: number
  readonly innerRadius: number
  readonly startAngle: number
  readonly endAngle: number
  readonly antiClockwise: boolean

  constructor(config: {
    at: Point2D
    r: number
    r2: number
    a: number
    a2: number
  }) {
    const {
      at: [cX, cY],
      r,
      r2,
      a,
      a2,
    } = config
    const antiClockwise = a > a2

    this.cX = cX
    this.cY = cY
    this.radius = r
    this.innerRadius = r2
    this.startAngle = a
    this.endAngle = a2
    this.antiClockwise = antiClockwise
  }
  traceIn = (ctx: CanvasRenderingContext2D) => {
    ctx.moveTo(
      this.cX + this.innerRadius * Math.cos(this.startAngle),
      this.cY + this.innerRadius * Math.sin(this.startAngle)
    )

    ctx.lineTo(
      this.cX + this.radius * Math.cos(this.startAngle),
      this.cY + this.radius * Math.sin(this.startAngle)
    )

    ctx.arc(
      this.cX,
      this.cY,
      this.radius,
      this.startAngle,
      this.endAngle,
      this.antiClockwise
    )

    ctx.lineTo(
      this.cX + this.innerRadius * Math.cos(this.endAngle),
      this.cY + this.innerRadius * Math.sin(this.endAngle)
    )

    ctx.arc(
      this.cX,
      this.cY,
      this.innerRadius,
      this.endAngle,
      this.startAngle,
      !this.antiClockwise
    )
  }
}

export class Rect implements Traceable {
  readonly at: Point2D
  readonly w: number
  readonly h: number

  constructor(config: { at: Point2D; w: number; h: number }) {
    const { at, w, h } = config

    this.at = at
    this.w = w
    this.h = h
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    ctx.rect(this.at[0], this.at[1], this.w, this.h)
  }

  get path(): SimplePath {
    const [x, y] = this.at
    return SimplePath.withPoints([
      this.at,
      [x + this.w, y],
      [x + this.w, y + this.h],
      [x, y + this.h],
    ]).close()
  }

  split = (config: {
    orientation: "vertical" | "horizontal"
    split?: number | number[]
  }): Rect[] => {
    let { orientation, split } = config
    split = split || 0.5

    if (orientation === "horizontal") {
      if (typeof split === "number") {
        return [
          new Rect({ at: this.at, w: this.w / 2, h: this.h }),
          new Rect({
            at: [this.at[0] + this.w / 2, this.at[1]],
            w: this.w / 2,
            h: this.h,
          }),
        ]
      } else {
        const total = split.reduce((a, b) => a + b, 0)
        const proportions = split.map(s => s / total)
        let xDxs: [number, number][] = []
        let c = 0
        proportions.forEach(p => {
          xDxs.push([c, p * this.w])
          c += p * this.w
        })

        return xDxs.map(
          ([x, dX], i) =>
            new Rect({
              at: [this.at[0] + x, this.at[1]],
              w: dX,
              h: this.h,
            })
        )
      }
    } else {
      if (typeof split === "number") {
        return [
          new Rect({ at: this.at, w: this.w, h: this.h / 2 }),
          new Rect({
            at: [this.at[0], this.at[1] + this.h / 2],
            w: this.w,
            h: this.h / 2,
          }),
        ]
      } else {
        const total = split.reduce((a, b) => a + b, 0)
        const proportions = split.map(s => s / total)
        let yDys: [number, number][] = []
        let c = 0
        proportions.forEach(p => {
          yDys.push([c, p * this.h])
          c += p * this.h
        })

        return yDys.map(
          ([y, dY], i) =>
            new Rect({
              at: [this.at[0], this.at[1] + y],
              w: this.w,
              h: dY,
            })
        )
      }
    }
  }
}

export class RoundedRect implements Traceable {
  readonly at: Point2D
  readonly w: number
  readonly h: number
  readonly r: number

  constructor(config: { at: Point2D; w: number; h: number; r: number }) {
    const { at, w, h, r } = config

    this.at = at
    this.w = w
    this.h = h
    this.r = r
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    const r = Math.min(this.r, this.h / 2, this.w / 2)
    const [x1, y1] = this.at
    const x2 = x1 + this.w
    const y2 = y1 + this.h

    ctx.moveTo(x1 + r, y1)
    ctx.lineTo(x2 - r, y1)
    ctx.quadraticCurveTo(x2, y1, x2, y1 + r)
    ctx.lineTo(x2, y2 - r)
    ctx.quadraticCurveTo(x2, y2, x2 - r, y2)
    ctx.lineTo(x1 + r, y2)
    ctx.quadraticCurveTo(x1, y2, x1, y2 - r)
    ctx.lineTo(x1, y1 + r)
    ctx.quadraticCurveTo(x1, y1, x1 + r, y1)
  }
}

/**
 * Technically you can't do ellipses/circles properly with cubic beziers, but you can come very, very close
 *
 * Uses 4 point, cubic beziers, approximation of (4/3)*tan(pi/8) for control points
 *
 * https://stackoverflow.com/questions/1734745/how-to-create-circle-with-bézier-curves
 */
export class Ellipse implements Traceable {
  constructor(
    protected config: {
      at: Point2D
      w: number
      h: number
      align?: "center" | "topLeft"
    }
  ) {}

  traceIn = (ctx: CanvasRenderingContext2D) => {
    const { at, w: width, h: height, align = "center" } = this.config
    const [cX, cY] =
      align === "center" ? at : [at[0] + width / 2, at[1] + height / 2]

    const a = (4 / 3) * Math.tan(Math.PI / 8)

    ctx.moveTo(cX, cY - height / 2)
    ctx.bezierCurveTo(
      cX + (a * width) / 2,
      cY - height / 2,
      cX + width / 2,
      cY - (a * height) / 2,
      cX + width / 2,
      cY
    )

    ctx.bezierCurveTo(
      cX + width / 2,
      cY + (a * height) / 2,
      cX + (a * width) / 2,
      cY + height / 2,
      cX,
      cY + height / 2
    )

    ctx.bezierCurveTo(
      cX - (a * width) / 2,
      cY + height / 2,
      cX - width / 2,
      cY + (a * height) / 2,
      cX - width / 2,
      cY
    )

    ctx.bezierCurveTo(
      cX - width / 2,
      cY - (a * height) / 2,
      cX - (a * width) / 2,
      cY - height / 2,
      cX,
      cY - height / 2
    )
  }
}

/**
 * Just an ellipse with width = height
 */
export class Circle extends Ellipse {
  constructor(config: {
    at: Point2D
    r: number
    align?: "center" | "topLeft"
  }) {
    super({
      at: config.at,
      w: config.r * 2,
      h: config.r * 2,
      align: config.align,
    })
  }
}

export class RegularPolygon implements Traceable {
  constructor(
    private config: {
      at: Point2D
      n: number
      r: number
      a?: number
    }
  ) {
    if (this.config.n < 3)
      throw new Error(
        `Must have at least 3 sides, n was set to ${this.config.n}`
      )
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    let {
      at: [x, y],
      n,
      r,
      a: startAngle = 0,
    } = this.config
    // Start from top... feels more natural?
    startAngle -= Math.PI / 2
    const dA = (Math.PI * 2) / n
    ctx.moveTo(x + r * Math.cos(startAngle), y + r * Math.sin(startAngle))
    for (let i = 1; i < n; i++) {
      ctx.lineTo(
        x + r * Math.cos(startAngle + i * dA),
        y + r * Math.sin(startAngle + i * dA)
      )
    }
    ctx.lineTo(x + r * Math.cos(startAngle), y + r * Math.sin(startAngle))
  }

  get path(): SimplePath {
    return traceSimplePath(this)
  }
}

/**
 * NB Not all canvas stuff supported, don't export this!
 * Good enough for some things
 * @param traceable
 */
function traceSimplePath(traceable: Traceable): SimplePath {
  const sp = SimplePath.withPoints([])

  traceable.traceIn({
    moveTo(x, y) {
      sp.addPoint([x, y])
    },
    lineTo(x, y) {
      sp.addPoint([x, y])
    },
  } as CanvasRenderingContext2D)
  return sp
}

export class Star implements Traceable {
  constructor(
    private config: {
      at: Point2D
      n: number
      r: number
      r2?: number
      a?: number
    }
  ) {
    if (this.config.n < 3)
      throw new Error(
        `Must have at least 3 points, n was set to ${this.config.n}`
      )
  }

  traceIn = (ctx: CanvasRenderingContext2D) => {
    let {
      at: [x, y],
      n,
      r,
      a: startAngle = 0,
      r2,
    } = this.config
    // Start from top... feels more natural?
    startAngle -= Math.PI / 2
    r2 || (r2 = r / 2)
    const dA = (Math.PI * 2) / n
    ctx.moveTo(x + r * Math.cos(startAngle), y + r * Math.sin(startAngle))
    for (let i = 1; i < n; i++) {
      ctx.lineTo(
        x + r2 * Math.cos(startAngle + (i - 0.5) * dA),
        y + r2 * Math.sin(startAngle + (i - 0.5) * dA)
      )
      ctx.lineTo(
        x + r * Math.cos(startAngle + i * dA),
        y + r * Math.sin(startAngle + i * dA)
      )
    }
    ctx.lineTo(
      x + r2 * Math.cos(startAngle + -0.5 * dA),
      y + r2 * Math.sin(startAngle + -0.5 * dA)
    )
    ctx.lineTo(x + r * Math.cos(startAngle), y + r * Math.sin(startAngle))
  }

  get path(): SimplePath {
    return traceSimplePath(this)
  }
}

/**
 * Hatching in a circle around a point, with a radius and delta between lines
 */
export class Hatching implements Traceable {
  constructor(
    private config: {
      at: Point2D
      r: number
      a: number
      delta: number
    }
  ) {}

  traceIn = (ctx: CanvasRenderingContext2D) => {
    const {
      at: [x, y],
      r,
      a,
      delta,
    } = this.config

    let perpOffset = 0

    const rca = r * Math.cos(a - Math.PI / 2)
    const rsa = r * Math.sin(a - Math.PI / 2)

    const dX = Math.cos(a)
    const dY = Math.sin(a)

    ctx.moveTo(x - rca, y - rsa)
    ctx.lineTo(x + rca, y + rsa)

    while (perpOffset < r) {
      perpOffset += delta
      const [sX, sY] = [perpOffset * dX, perpOffset * dY]

      // divide by r as using rsa/rca below
      const rl = Math.sqrt(r * r - perpOffset * perpOffset) / r

      ctx.moveTo(x + sX - rl * rca, y + sY - rl * rsa)
      ctx.lineTo(x + sX + rl * rca, y + sY + rl * rsa)

      ctx.moveTo(x - sX - rl * rca, y - sY - rl * rsa)
      ctx.lineTo(x - sX + rl * rca, y - sY + rl * rsa)
    }
  }
}

export type TextSizing = "fixed" | "fitted"
export type TextHorizontalAlign = CanvasRenderingContext2D["textAlign"]
export type FontStyle = "normal" | "italic" | "oblique"
export type FontVariant = "normal" | "small-caps"
export type FontWeight =
  | "normal"
  | "bold"
  | "bolder"
  | "lighter"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
export enum Font {
  Arial = "Arial",
  Helvetica = "Helvetica",
  TimesNewRoman = "Times New Roman",
  Times = "Times",
  CourierNew = "Courier New",
  Courier = "Courier",
  Palatino = "Palatino",
  Garamond = "Garamond",
  Bookman = "Bookman",
  AvantGarde = "Avant Garde",
  System = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
}

export type TextConfigWithKind = {
  sizing?: TextSizing
  align?: TextHorizontalAlign
  size: number
  font?: Font
  at: Point2D
  kind: "fill" | "stroke"
  style?: FontStyle
  weight?: FontWeight
  variant?: FontVariant
}

export type TextConfig = Omit<TextConfigWithKind, "kind">

export class Text implements Textable {
  /**
   * Text is always vertically aligned
   * By default is fixed (specified vertcial font size) but can choose fitted, then will fit horizontally to size
   * @param config Configuration
   */
  constructor(private config: TextConfigWithKind, private text: string) {}

  textIn = (ctx: CanvasRenderingContext2D) => {
    const {
      size,
      sizing = "fixed",
      align = "center",
      font = Font.System,
      at,
      style = "normal",
      weight = "normal",
      variant = "normal",
      kind,
    } = this.config
    ctx.textAlign = align

    let y: number
    if (sizing === "fixed") {
      ctx.font = `${style} ${variant} ${weight} ${size}px ${font}`
      y = at[1] + size / 2
    } else {
      ctx.font = `${style} ${variant} ${weight} 1px ${font}`
      const { width: mW } = ctx.measureText(this.text)
      const sizeH = size / mW
      ctx.font = `${style} ${variant} ${weight} ${sizeH}px ${font}`
      y = at[1] + sizeH / 2
    }
    if (kind === "fill") {
      ctx.fillText(this.text, at[0], y)
    } else {
      ctx.strokeText(this.text, at[0], y)
    }
  }
}
