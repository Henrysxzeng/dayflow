const { callCloud } = require('../../utils/api')

Page({
  data: {
    form: {
      title: '',
      deadlineDate: '',
      deadlineTime: '',
      estimatedMinutes: 30,
      importance: 3,
      description: '',
      schedulingMode: 'ai',  // 'ai' | 'manual'
      preferredTime: '',     // HH:MM，手动安排时设置
      lockedStartTime: '',   // HH:MM，固定时间段
      reminderMinutesBefore: 0  // 截止前多少分钟提醒（0=不提醒）
    },
    // 预计用时（自定义放最前面）
    durationOptions: [
      { label: '自定义', value: -1 },
      { label: '5分', value: 5 },
      { label: '15分', value: 15 },
      { label: '30分', value: 30 },
      { label: '1小时', value: 60 },
      { label: '1.5小时', value: 90 },
      { label: '2小时', value: 120 },
      { label: '3小时', value: 180 }
    ],
    importanceOptions: [
      { label: '低', value: 1 },
      { label: '中', value: 2 },
      { label: '高', value: 3 },
      { label: '非常高', value: 4 }
    ],
    showCustomDuration: false,
    customHours: '0',
    customMinutes: '30',
    isEditMode: false,
    editTaskId: null,
    showTemplates: false,
    // 好友邀请
    inviteFriend: false,
    friends: [],
    selectedFriendId: null,
    selectedFriendName: '',
    templateCategories: [
      {
        name: '📚 学习', templates: [
          { title: '阅读书籍', minutes: 30 }, { title: '英语学习', minutes: 20 },
          { title: '整理笔记', minutes: 15 }, { title: '复习知识点', minutes: 45 },
          { title: '在线课程', minutes: 60 }
        ]
      },
      {
        name: '💼 工作', templates: [
          { title: '写周报', minutes: 30 }, { title: '回复邮件', minutes: 20 },
          { title: '整理文件', minutes: 15 }, { title: '准备会议材料', minutes: 30 },
          { title: '项目进度汇报', minutes: 45 }
        ]
      },
      {
        name: '🏃 健康', templates: [
          { title: '冥想放松', minutes: 15 }, { title: '散步', minutes: 30 },
          { title: '健身运动', minutes: 60 }, { title: '拉伸运动', minutes: 15 },
          { title: '睡前准备', minutes: 20 }
        ]
      },
      {
        name: '🏠 生活', templates: [
          { title: '购物采买', minutes: 30 }, { title: '整理房间', minutes: 30 },
          { title: '处理账单', minutes: 20 }, { title: '做饭', minutes: 45 },
          { title: '联系家人朋友', minutes: 20 }
        ]
      }
    ],
    activeTemplateCategory: 0
  },

  onLoad(options) {
    if (options && options.taskId) {
      this.setData({ isEditMode: true, editTaskId: options.taskId })
      const { callCloud } = require('../../utils/api')
      callCloud('getTasks').then(res => {
        const task = (res.tasks || []).find(t => t._id === options.taskId)
        if (!task) return
        const dateStr = task.deadline ? task.deadline.split(' ')[0] : ''
        const timeStr = task.deadline && task.deadline.includes(' ') ? task.deadline.split(' ')[1] : ''
        this.setData({
          'form.title': task.title,
          'form.deadlineDate': dateStr,
          'form.deadlineTime': timeStr,
          'form.estimatedMinutes': task.estimated_minutes || 30,
          'form.importance': task.importance || 2,
          'form.description': task.description || '',
          'form.schedulingMode': task.locked_start_time ? 'manual' : 'ai',
          'form.lockedStartTime': task.locked_start_time || '',
          'form.reminderMinutesBefore': task.reminder_minutes_before || 0
        })
      }).catch(() => {})
    }
  },

  handleTitleInput(e) { this.setData({ 'form.title': e.detail.value }) },
  handleDeadlineChange(e) { this.setData({ 'form.deadlineDate': e.detail.value }) },
  handleDeadlineTimeChange(e) { this.setData({ 'form.deadlineTime': e.detail.value }) },
  handleDescInput(e) { this.setData({ 'form.description': e.detail.value }) },
  handleImportanceSelect(e) { this.setData({ 'form.importance': e.currentTarget.dataset.value }) },

  handleDurationSelect(e) {
    const value = e.currentTarget.dataset.value
    if (value === -1) {
      this.setData({ showCustomDuration: true, customHours: '0', customMinutes: '30', 'form.estimatedMinutes': 30 })
    } else {
      this.setData({ showCustomDuration: false, 'form.estimatedMinutes': value })
    }
  },
  handleCustomHoursInput(e) {
    const h = parseInt(e.detail.value) || 0
    const m = parseInt(this.data.customMinutes) || 0
    this.setData({ customHours: e.detail.value, 'form.estimatedMinutes': h * 60 + m })
  },
  handleCustomMinutesInput(e) {
    const h = parseInt(this.data.customHours) || 0
    const m = parseInt(e.detail.value) || 0
    this.setData({ customMinutes: e.detail.value, 'form.estimatedMinutes': h * 60 + m })
  },

  // 排期模式切换
  switchSchedulingMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ 'form.schedulingMode': mode, 'form.lockedStartTime': '' })
  },
  handleLockedTimeChange(e) {
    this.setData({ 'form.lockedStartTime': e.detail.value })
  },
  handlePreferredTimeChange(e) {
    this.setData({ 'form.preferredTime': e.detail.value })
  },

  // 提醒设置
  handleReminderChange(e) {
    const minutes = parseInt(e.currentTarget.dataset.minutes) || 0
    this.setData({ 'form.reminderMinutesBefore': minutes })
  },

  openTemplates() { this.setData({ showTemplates: true }) },
  closeTemplates() { this.setData({ showTemplates: false }) },
  switchTemplateCategory(e) { this.setData({ activeTemplateCategory: e.currentTarget.dataset.index }) },
  applyTemplate(e) {
    const { title, minutes } = e.currentTarget.dataset
    this.setData({ 'form.title': title, 'form.estimatedMinutes': minutes, showCustomDuration: false, showTemplates: false })
  },

  toggleInviteFriend() {
    const next = !this.data.inviteFriend
    this.setData({ inviteFriend: next, selectedFriendId: null, selectedFriendName: '' })
    if (next && this.data.friends.length === 0) {
      callCloud('getFriendsData').then(res => {
        this.setData({ friends: res.friends || [] })
      }).catch(() => {})
    }
  },
  selectFriend(e) {
    this.setData({ selectedFriendId: e.currentTarget.dataset.id, selectedFriendName: e.currentTarget.dataset.name })
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

    let deadline = null
    if (form.deadlineDate) {
      deadline = form.deadlineTime ? `${form.deadlineDate} ${form.deadlineTime}` : form.deadlineDate
    }

    wx.showLoading({ title: this.data.isEditMode ? '保存中...' : '添加中...' })
    try {
      if (this.data.inviteFriend && this.data.selectedFriendId) {
        await callCloud('createSharedTask', {
          title: form.title.trim(), deadline,
          estimatedMinutes: form.estimatedMinutes,
          importance: form.importance,
          friendUserId: this.data.selectedFriendId
        })
        wx.hideLoading()
        wx.showToast({ title: `已邀请 ${this.data.selectedFriendName}！`, icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }

      const taskData = {
        title: form.title.trim(),
        deadline,
        estimatedMinutes: form.estimatedMinutes,
        importance: form.importance,
        description: form.description,
        lockedStartTime: form.schedulingMode === 'manual' ? form.lockedStartTime : null,
        preferredTime: form.schedulingMode === 'ai' && form.preferredTime ? form.preferredTime : null,
        reminderMinutesBefore: form.reminderMinutesBefore || 0
      }

      if (this.data.isEditMode) {
        await callCloud('updateTask', { taskId: this.data.editTaskId, ...taskData })
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
      } else {
        await callCloud('addTask', taskData)
        wx.hideLoading()
        wx.showToast({ title: '已添加', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: this.data.isEditMode ? '保存失败' : '添加失败', icon: 'none' })
    }
  }
})
