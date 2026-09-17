'use client'

import { useEffect } from 'react'
import { playClick, playMapClick, playStoryClick, playDrawCard } from '@/lib/sound'
import { ensureMusicOnFirstInteraction } from '@/lib/music'

/**
 * 全局质感点击声：
 * - 顶部主菜单（header 内）保留「咔嚓」声
 * - 地图页 → 皮革地图展开的闷响
 * - 剧情页 → 翻书页的轻响
 * - 马桶里抽牌 → 卡牌翻转的 whoosh
 * 拖动地图、普通文字不会响。
 */
export default function ClickSound() {
  useEffect(() => {
    // 回访用户入场券已撕过，没有点击可触发，在此兜底启动音乐
    ensureMusicOnFirstInteraction()

    const onPointerDown = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest) return
      if (target.closest('[data-no-click-sound]')) return
      const interactive = target.closest('a, button, [role="button"]') as HTMLElement | null
      if (!interactive) return
      if (interactive.getAttribute('aria-disabled') === 'true') return

      // 顶部主菜单 → 保留咔嚓
      if (interactive.closest('header')) {
        playClick()
        return
      }
      // 按所在页面路由分配音效
      const path = window.location.pathname
      if (path === '/') playMapClick()
      else if (path.startsWith('/articles')) playStoryClick()
      else if (path.startsWith('/toilet')) playDrawCard()
      else playClick()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  return null
}
