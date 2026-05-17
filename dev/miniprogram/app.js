App({
  onLaunch() {
    wx.cloud.init({
      env: 'cloudbase-d8g5men5j0e2712cd',
      traceUser: true
    })
  },
  globalData: {
    openid: null,
    streak: 0
  }
})
