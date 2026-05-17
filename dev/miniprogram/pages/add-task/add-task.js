const { callCloud } = require('../../utils/api')

Page({
  data: {
    form: {
      title: '',
      deadlineDate: '',
      deadlineTime: '',
      estimatedMinutes: 30,
      importance: 3,
      description: ''
    },
    durationOptions: [
      { label: '5分', value: 5 },
      { label: '15分', value: 15 },
      { label: '30分', value: 30 },
      { label: '1小时', value: 60 },
      { label: '1.5小时', value: 90 },
      { label: '2小时', value: 120 },
      { label: '3小时', value: 180 },
      { label: '自定义', value: -1 }
    ],
    importanceOptions: [
      { label: '低', value: 1 },
      { label: '中', value: 2 },
      { label: '高', value: 3 },
      { label: '非常高', value: 4 }
    ],
    showCustomDuration: false,
    customDurationText: ''
  },

  handleTitleInput(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  handleDeadlineChange(e) {
    this.setData({ 'form.deadlineDate': e.detail.value })
  },

  handleDeadlineTimeChange(e) {
    this.setData({ 'form.deadlineTime': e.detail.value })
  },

  handleDurationSelect(e) {
    const value = e.currentTarget.dataset.value
    if (value === -1) {
      this.setData({ showCustomDuration: true, customDurationText: '', 'form.estimatedMinutes': 0 })
    } else {
      this.setData({ showCustomDuration: false, 'form.estimatedMinutes': value })
    }
  },

  handleCustomDurationInput(e) {
    const minutes = parseInt(e.detail.value) || 0
    this.setData({ customDurationText: e.detail.value, 'form.estimatedMinutes': minutes })
  },

  handleImportanceSelect(e) {
    this.setData({ 'form.importance': e.currentTarget.dataset.value })
  },

  handleDescInput(e) {
    this.setData({ 'form.description': e.detail.value })
  },

  async handleSubmit() {
    const { form } = this.data
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写任务名称', icon: 'none' })
      return
    }
    if (form.estimatedMinutes <= 0) {
      wx.showToast({ title: '请填写预计用时', icon: 'none' })
      return
    }

    // 合并日期和时间
    let deadline = null
    if (form.deadlineDate) {
      deadline = form.deadlineTime
        ? `${form.deadlineDate} ${form.deadlineTime}`
        : form.deadlineDate
    }

    wx.showLoading({ title: '添加中...' })
    try {
      await callCloud('addTask', {
        title: form.title.trim(),
        deadline,
        estimatedMinutes: form.estimatedMinutes,
        importance: form.importance,
        description: form.description
      })
      wx.hideLoading()
      wx.showToast({ title: '已添加', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  }
})
