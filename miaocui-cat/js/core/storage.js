/** wx.storage 的薄封装，所有键值集中在这里，失败静默降级为内存态 */

export function loadJSON(key) {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined || v === null ? null : v
  } catch (e) {
    return null
  }
}

export function saveJSON(key, val) {
  try {
    wx.setStorageSync(key, val)
  } catch (e) {
    // 空间不足等异常：游戏本身可继续，只是本次不存档
  }
}

export function removeJSON(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    // 忽略
  }
}
