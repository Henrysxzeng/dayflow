const callCloud = (name, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => {
        if (res.result && res.result.error) {
          reject(new Error(res.result.error))
        } else {
          resolve(res.result)
        }
      },
      fail: err => reject(err)
    })
  })
}

module.exports = { callCloud }
