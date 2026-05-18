const { callCloud } = require('../../utils/api')

// 生成小时选项 0-24
const STANDARD_DURATIONS = [5, 15, 30, 60, 90, 120, 180]

const calcEndTime = (startTime, minutes) => {
  if (!startTime || !minutes) return ''
  const parts = startTime.split(':').map(Number)
  const h = parts[0]
  const m = parts[1]
  const total = h * 60 + m + minutes
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return (eh < 10 ? '0' : '') + eh + ':' + (em < 10 ? '0' : '') + em
}

Page({
  data: {
    form: {
      title: '',
      deadlineDate: '',
      deadlineTime: '',
      estimatedMinutes: 30,
      importance: 3,
      description: '',
      schedulingMode: 'ai',
      preferredTime: '',
      lockedStartTime: '',
      lockedEndTime: '',   // 根据开始时间+用时自动计算
      reminderMinutesBefore: 0,
      customReminderMinutes: 0,
      showCustomReminder: false
    },
    // 时长picker（小时0-12 + 分钟0,5,10,...,55）
    durationPickerRange: [
      Array.from({ length: 13 }, (_, i) => `${i}小时`),
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => `${m}分`)
    ],
    durationPickerValue: [0, 6],   // 默认0小时30分
    showDurationPicker: false,
    durationLabel: '30分',
    durationIsNonStandard: false,  // 用于判断是否显示自定义chip为选中
    durationOptions: [
      { label: '自定义', value: -1 },
      { label: '5分', value: 5 },
      { label: '15分', value: 15 },
      { label: '30分', value: 30 },
      { label: '1小时', value: 60 },
      { label: '1.5h', value: 90 },
      { label: '2小时', value: 120 },
      { label: '3小时', value: 180 }
    ],
    importanceOptions: [
      { label: '低', value: 1 },
      { label: '中', value: 2 },
      { label: '高', value: 3 },
      { label: '非常高', value: 4 }
    ],
    isEditMode: false,
    editTaskId: null,
    showTemplates: false,
    activeTemplateCategory: 0,
    templateCategories: [
      {
        name: '📚 学习', templates: [
          { title: '阅读书籍', minutes: 30 }, { title: '英语学习', minutes: 15 },
          { title: '整理笔记', minutes: 15 }, { title: '复习知识点', minutes: 60 },
          { title: '在线课程', minutes: 60 }
        ]
      },
      {
        name: '💼 工作', templates: [
          { title: '写周报', minutes: 30 }, { title: '回复邮件', minutes: 15 },
          { title: '整理文件', minutes: 15 }, { title: '准备会议材料', minutes: 30 },
          { title: '项目进度汇报', minutes: 60 }
        ]
      },
      {
        name: '🏃 健康', templates: [
          { title: '冥想放松', minutes: 15 }, { title: '散步', minutes: 30 },
          { title: '健身运动', minutes: 60 }, { title: '拉伸运动', minutes: 15 },
          { title: '睡前准备', minutes: 30 }
        ]
      },
      {
        name: '🏠 生活', templates: [
          { title: '购物采买', minutes: 30 }, { title: '整理房间', minutes: 30 },
          { title: '处理账单', minutes: 30 }, { title: '做饭', minutes: 60 },
          { title: '联系家人朋友', minutes: 30 }
        ]
      }
    ],
    activeTemplateCategory: -1,   // -1 = 我的（默认显示我的）
    customTemplates: [],
    showAddCustomTemplate: false,
    newTemplateTitle: '',
    newTemplateMinutes: 30,
    inviteFriend: false,
    friends: [],
    selectedFriendId: null,
    selectedFriendName: '',
    recurrenceOptions: [
      { label: '不循环', value: 'none' },
      { label: '每天', value: 'daily' },
      { label: '每周', value: 'weekly' },
      { label: '自定义', value: 'custom' }
    ],
    recurrenceType: 'none',
    recurrenceInterval: 7
  },

  onLoad(options) {
    this.loadCustomTemplates()
    if (options && options.taskId) {
      this.setData({ isEditMode: true, editTaskId: options.taskId })
      callCloud('getTasks').then(res => {
        const task = (res.tasks || []).find(t => t._id === options.taskId)
        if (!task) return
        const dateStr = task.deadline ? task.deadline.split(' ')[0] : ''
        const timeStr = task.deadline && task.deadline.includes(' ') ? task.deadline.split(' ')[1] : ''
        const mins = task.estimated_minutes || 30
        const h = Math.floor(mins / 60)
        const m = mins % 60
        const mIdx = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].indexOf(m)
        this.setData({
          'form.title': task.title,
          'form.deadlineDate': dateStr,
          'form.deadlineTime': timeStr,
          'form.estimatedMinutes': mins,
          'form.importance': task.importance || 2,
          'form.description': task.description || '',
          'form.schedulingMode': task.locked_start_time ? 'manual' : 'ai',
          'form.lockedStartTime': task.locked_start_time || '',
          'form.lockedEndTime': task.locked_start_time ? calcEndTime(task.locked_start_time, mins) : '',
          'form.reminderMinutesBefore': task.reminder_minutes_before || 0,
          durationPickerValue: [h, Math.max(0, mIdx)],
          durationLabel: h > 0 ? `${h}小时${m > 0 ? m + '分' : ''}` : `${m}分`
        })
      }).catch(() => {})
    }
  },

  loadCustomTemplates() {
    try {
      const stored = wx.getStorageSync('custom_templates') || []
      this.setData({ customTemplates: stored })
    } catch (e) { }
  },

  // ── 时长选择 ──
  _setDuration(minutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    const mList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    const mIdx = Math.max(0, mList.indexOf(m) === -1 ? mList.indexOf(mList.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a)) : mList.indexOf(m))
    const label = h > 0 ? `${h}小时${m > 0 ? m + '分' : ''}` : `${m}分`
    const isNonStandard = !STANDARD_DURATIONS.includes(minutes)
    this.setData({
      'form.estimatedMinutes': minutes,
      durationPickerValue: [h, mIdx],
      durationLabel: label,
      durationIsNonStandard: isNonStandard,
      'form.lockedEndTime': calcEndTime(this.data.form.lockedStartTime, minutes)
    })
  },

  handleDurationSelect(e) {
    const value = e.currentTarget.dataset.value
    if (value === -1) {
      // 打开前先把picker同步到当前estimatedMinutes，避免native picker认为"没改变"不触发bindchange
      const cur = this.data.form.estimatedMinutes || 30
      const h = Math.floor(cur / 60)
      const mList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
      const mIdx = mList.indexOf(cur % 60) === -1 ? 0 : mList.indexOf(cur % 60)
      this.setData({ showDurationPicker: true, durationPickerValue: [h, mIdx] })
    } else {
      this._setDuration(value)
      this.setData({ showDurationPicker: false })
    }
  },

  handleDurationPickerChange(e) {
    const hIdx = e.detail.value[0]
    const mIdx = e.detail.value[1]
    const h = hIdx
    const m = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55][mIdx] || 0
    const total = h * 60 + m || 5
    this._setDuration(total)
    // 通过picker选的，强制自定义chip高亮（即使是标准时长）
    this.setData({ showDurationPicker: false, durationIsNonStandard: true })
  },

  cancelDurationPicker() { this.setData({ showDurationPicker: false }) },

  // ── 基础字段 ──
  handleTitleInput(e) { this.setData({ 'form.title': e.detail.value }) },
  handleDeadlineChange(e) { this.setData({ 'form.deadlineDate': e.detail.value }) },
  handleDeadlineTimeChange(e) { this.setData({ 'form.deadlineTime': e.detail.value }) },
  handleDescInput(e) { this.setData({ 'form.description': e.detail.value }) },
  handleImportanceSelect(e) { this.setData({ 'form.importance': e.currentTarget.dataset.value }) },

  // ── 排期模式 ──
  switchSchedulingMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ 'form.schedulingMode': mode, 'form.lockedStartTime': '', 'form.lockedEndTime': '' })
  },
  handleLockedTimeChange(e) {
    const time = e.detail.value
    this.setData({
      'form.lockedStartTime': time,
      'form.lockedEndTime': calcEndTime(time, this.data.form.estimatedMinutes)
    })
  },
  handlePreferredTimeChange(e) { this.setData({ 'form.preferredTime': e.detail.value }) },

  // ── 提醒 ──
  handleReminderSelect(e) {
    const v = parseInt(e.currentTarget.dataset.v) || 0
    if (v === -1) {
      this.setData({ 'form.showCustomReminder': true, 'form.reminderMinutesBefore': 0 })
    } else {
      this.setData({ 'form.reminderMinutesBefore': v, 'form.showCustomReminder': false })
    }
  },
  handleCustomReminderInput(e) {
    const val = parseInt(e.detail.value) || 0
    this.setData({ 'form.reminderMinutesBefore': val })
  },

  // ── 模板 ──
  noop() { },  // 阻止事件冒泡用

  openTemplates() {
    this.loadCustomTemplates()
    this.setData({ showTemplates: true, activeTemplateCategory: -1 })
  },
  closeTemplates() { this.setData({ showTemplates: false, showAddCustomTemplate: false }) },
  switchTemplateCategory(e) { this.setData({ activeTemplateCategory: parseInt(e.currentTarget.dataset.index) }) },

  applyTemplate(e) {
    const { title, minutes } = e.currentTarget.dataset
    this.setData({ 'form.title': title, showTemplates: false, showAddCustomTemplate: false })
    this._setDuration(parseInt(minutes))
  },

  openAddCustomTemplate() { this.setData({ showAddCustomTemplate: true, newTemplateTitle: '', newTemplateMinutes: 30 }) },
  handleNewTemplateTitleInput(e) { this.setData({ newTemplateTitle: e.detail.value }) },
  handleNewTemplateMinutesInput(e) { this.setData({ newTemplateMinutes: parseInt(e.detail.value) || 30 }) },

  saveCustomTemplate() {
    const { newTemplateTitle, newTemplateMinutes, customTemplates } = this.data
    if (!newTemplateTitle.trim()) { wx.showToast({ title: '请填写模板名称', icon: 'none' }); return }
    const newList = [...customTemplates, { title: newTemplateTitle.trim(), minutes: newTemplateMinutes, id: Date.now() }]
    wx.setStorageSync('custom_templates', newList)
    this.setData({ customTemplates: newList, showAddCustomTemplate: false })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  deleteCustomTemplate(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除模板',
      content: '确认删除这个自定义模板？',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: res => {
        if (!res.confirm) return
        const newList = this.data.customTemplates.filter(t => t.id !== id)
        wx.setStorageSync('custom_templates', newList)
        this.setData({ customTemplates: newList })
      }
    })
  },

  // ── 好友邀请 ──
  selectRecurrence(e) { this.setData({ recurrenceType: e.currentTarget.dataset.value }) },
  handleRecurrenceIntervalInput(e) { this.setData({ recurrenceInterval: parseInt(e.detail.value) || 7 }) },

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

  // ── 提交 ──
  async handleSubmit() {
    const { form } = this.data
    if (!form.title.trim()) { wx.showToast({ title: '请填写任务名称', icon: 'none' }); return }
    if (form.estimatedMinutes <= 0) { wx.showToast({ title: '请填写预计用时', icon: 'none' }); return }

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
        reminderMinutesBefore: form.reminderMinutesBefore || 0,
        recurrenceType: this.data.recurrenceType || 'none',
        recurrenceInterval: this.data.recurrenceInterval || 7
      }

      if (this.data.isEditMode) {
        await callCloud('updateTask', { taskId: this.data.editTaskId, title: taskData.title, deadline: taskData.deadline, estimatedMinutes: taskData.estimatedMinutes, importance: taskData.importance, description: taskData.description, lockedStartTime: taskData.lockedStartTime, preferredTime: taskData.preferredTime, reminderMinutesBefore: taskData.reminderMinutesBefore })
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(function() { wx.navigateBack() }, 800)
      } else {
        const addRes = await callCloud('addTask', taskData)
        const newTaskId = addRes && addRes.taskId
        wx.hideLoading()

        // 判断是否紧急（今日截止或重要程度高）
        const today = new Date()
        const tm = today.getMonth() + 1
        const td = today.getDate()
        const todayStr = today.getFullYear() + '-' + (tm < 10 ? '0' : '') + tm + '-' + (td < 10 ? '0' : '') + td
        const isUrgentToday = (deadline && deadline.startsWith(todayStr)) || form.importance >= 3

        if (isUrgentToday && newTaskId) {
          getApp().globalData.newTaskForToday = {
            taskId: newTaskId,
            title: form.title.trim(),
            estimatedMinutes: form.estimatedMinutes
          }
        }

        // globalData已设置，直接跳转（不用toast等待，避免与今日页面的modal冲突）
        wx.navigateBack()
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: this.data.isEditMode ? '保存失败' : '添加失败', icon: 'none' })
    }
  }
})
