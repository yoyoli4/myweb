/**
 * 场景调度器：持有主画布 ctx，驱动唯一的 requestAnimationFrame 循环。
 * 场景只需实现可选方法：enter / update(dt) / render(ctx) / onTouchStart(x,y) 等。
 */
export class Director {
  constructor(ctx, view) {
    this.ctx = ctx
    this.view = view
    this.scene = null
    this._last = 0
    this._boundLoop = this._loop.bind(this)
  }

  runScene(scene) {
    if (this.scene && typeof this.scene.onExit === 'function') this.scene.onExit()
    this.scene = scene
    scene.director = this
    if (typeof scene.enter === 'function') scene.enter()
  }

  dispatch(method, ...args) {
    const s = this.scene
    if (s && typeof s[method] === 'function') s[method](...args)
  }

  start() {
    requestAnimationFrame(this._boundLoop)
  }

  _loop(t) {
    const dt = this._last ? Math.min(50, t - this._last) : 16
    this._last = t

    const s = this.scene
    if (s) {
      // 单帧异常隔离：任何场景报错都打印但不杀死 rAF，
      // 否则 update/render 抛错后画面永久冻结（触摸仍响应却看不到变化）
      try {
        if (typeof s.update === 'function') s.update(dt)
      } catch (e) {
        console.error('[director] update error:', e)
      }
      try {
        s.render(this.ctx)
      } catch (e) {
        console.error('[director] render error:', e)
      }
    }
    requestAnimationFrame(this._boundLoop)
  }
}
