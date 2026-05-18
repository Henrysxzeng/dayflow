const { callCloud } = require('../../utils/api')
const { formatDateDisplay, todayString, minutesToDisplay } = require('../../utils/date')

const HOUR_OPTIONS = [
  { label: '自定义', value: 0 },  // 放第一位，最显眼
  { label: '1h', value: 1 },
  { label: '1.5h', value: 1.5 },
  { label: '2h', value: 2 },
  { label: '3h', value: 3 },
  { label: '4h', value: 4 },
  { label: '5h', value: 5 },
  { label: '6h', value: 6 },
  { label: '8h', value: 8 },
  { label: '10h', value: 10 }
]

const COMPLETION_MESSAGES = [
  '今天做到了，明天的你会感谢现在的你。',
  '今天多完成一件，明天就少一件紧急的。这叫复利。',
  '一件一件地做，这就是最好的方式。',
  '今天搞定的，都是明天更轻松的理由。',
  '做完了。好好休息，这也是效率的一部分。'
]

const ALL_DONE_QUOTES = [
  '今天的自律，是明天自由的代价。',
  '大多数人高估了一天能做的，却低估了每天坚持能到达的地方。',
  '做完了该做的，剩下的时间都是奖励。',
  '今天的完成，是对明天的你最好的礼物。',
  '一小步一小步，走出去的都是真实的路。'
]

Page({
  data: {
    dateDisplay: '',
    streak: 0,
    // 计划状态
    planReady: false,
    generating: false,
    selectedHours: null,
    availableHours: 4,
    hourOptions: HOUR_OPTIONS,
    mainTasks: [],
    fragmentTasks: [],
    scheduleItems: [],   // 合并了任务和忙碌时段的日程列表
    hasSchedule: false,  // 是否有具体时间安排
    aiSummary: '',
    totalMinutes: 0,
    bufferMinutes: 0,
    showFragments: true,
    todayPlanId: null,
    scheduleConstraints: '',
    // 时间输入步骤
    waitingForSchedule: false,
    selectedHoursTemp: null,
    scheduleInput: '',
    // 完成庆祝
    showCompletion: false,
    completedCount: 0,
    completionMessage: '',
    // 时间校准收集
    showTimeTracker: false,
    trackingTaskId: null,
    trackingTaskTitle: '',
    trackingIsLastTask: false,
    // 成就系统
    showAchievement: false,
    achievementQueue: [],
    currentAchievement: null,
    // 未规划的今日截止任务
    unplannedUrgentTasks: [],
    // 分享
    shareImagePath: '',
    // 情绪收集
    showMoodPicker: false,
    todayMood: '',
    // 临门一脚 & 最难任务反馈
    almostThere: false,
    hardestTaskId: null,
    showHardestBanner: false,
    hardestBannerText: '',
    // 周五预载
    showFridayPlanning: false,
    fridayNote: '',
    fridayNoteSaved: false,
    allTasksDone: false,
    allDoneQuote: '',
    // 番茄钟
    showPomodoro: false,
    pomodoroTaskId: null,
    pomodoroTaskTitle: '',
    pomodoroSeconds: 25 * 60,
    pomodoroDisplay: '25:00',
    pomodoroProgress: 0,
    pomodoroPhase: 'focus',  // focus | break
    pomodoroCount: 0,
    pomodoroStartTime: 0,
    // 新用户引导（4步骤）
    showOnboarding: false,
    onboardingStep: 0,
    habitsForm: {
      wakeTime: '07:00', sleepTime: '23:00',
      hasLunchBreak: null, lunchStart: '12:00', lunchEnd: '13:30',
      hasDinnerBreak: false, dinnerStart: '18:00', dinnerEnd: '19:00',
      weekendDifferent: false, weekendWakeTime: '09:00', weekendSleepTime: '00:00'
    },
    // 可用时长选择弹窗
    showCustomHoursModal: false,
    customHoursVal: '3',
    customMinsVal: '0',
    hoursPickerRange: [
      ['0小时','1小时','2小时','3小时','4小时','5小时','6小时','7小时','8小时','9小时','10小时','11小时','12小时','13小时','14小时','15小时','16小时','17小时','18小时','19小时','20小时','21小时','22小时','23小时','24小时'],
      ['0分','15分','30分','45分']
    ],
    hoursPickerValue: [3, 0],
    pendingNewTaskNotice: null,
    // 今天休息
    showRestDay: false,
    restDayDone: false,
    // 免死金牌
    showJoker: false,
    jokerCount: 0,
    // 失败原因标签
    showFailureTag: false,
    failureTagQueue: [],
    currentFailureTask: null
  },

  // 番茄钟计时器实例
  _pomodoroTimer: null,

  onLoad(options) {
    this.setData({ dateDisplay: formatDateDisplay() })
    this.initPage()
    // 周五预载入口（来自推送跳转）
    if (options && options.mode === 'friday') {
      this.setData({ showFridayPlanning: true })
    }
  },

  onShow() {
    if (this.data.showPomodoro && this.data.pomodoroStartTime > 0) {
      this._startPomodoroTick()
    }
    // 处理新建任务后的今日新任务提示
    // 从设置页跳来修改作息
    if (getApp().globalData.openHabitsSettings) {
      getApp().globalData.openHabitsSettings = false
      this.setData({ showOnboarding: true, onboardingStep: 3 })
      return
    }

    const newTask = getApp().globalData.newTaskForToday
    if (newTask) {
      getApp().globalData.newTaskForToday = null
      // 强制刷新：不管当前planReady状态，直接重新加载页面并带着新任务通知
      this.setData({
        pendingNewTaskNotice: newTask,
        showRestDay: false,
        showOnboarding: false,
        waitingForSchedule: false
      })
      wx.showLoading({ title: '加载中...', mask: false })
      this.initPage()
      return  // 跳过下面的planReady检查，避免重复调用initPage
    }

    // 处理从任务列表跳转的番茄钟请求
    const pending = getApp().globalData.pendingPomodoro
    if (pending) {
      getApp().globalData.pendingPomodoro = null
      this.handleStartPomodoro({ currentTarget: { dataset: { id: pending.id, title: pending.title } } })
      return
    }
    if (this.data.planReady || this.data.waitingForSchedule) return
    this.setData({ showOnboarding: false, showRestDay: false })
    this.initPage()
  },

  onHide() {
    // 进入后台，停止UI更新（时间戳仍保留，回来后继续算）
    if (this._pomodoroTimer) {
      clearInterval(this._pomodoroTimer)
      this._pomodoroTimer = null
    }
  },

  onUnload() {
    if (this._pomodoroTimer) clearInterval(this._pomodoroTimer)
  },

  async initPage() {
    wx.showLoading({ title: '加载中...', mask: false })
    try {
      const result = await callCloud('getUserInfo')
      const app = getApp()
      app.globalData.openid = result.openid
      this.setData({ streak: result.streak || 0, jokerCount: result.jokers_remaining || 0 })
      if (result.userType) getApp().globalData.userType = result.userType

      // 番茄钟持久化恢复
      if (result.activePomodoro && !this.data.showPomodoro) {
        const p = result.activePomodoro
        this.setData({
          showPomodoro: true,
          pomodoroTaskId: p.task_id,
          pomodoroTaskTitle: p.task_title,
          pomodoroPhase: p.phase || 'focus',
          pomodoroStartTime: p.start_time,
          pomodoroSeconds: p.remaining,
          pomodoroDisplay: `${String(Math.floor(p.remaining / 60)).padStart(2, '0')}:${String(p.remaining % 60).padStart(2, '0')}`,
          pomodoroProgress: 1 - p.remaining / (p.total_seconds || 25 * 60)
        })
        this._startPomodoroTick()
        wx.hideLoading()
        return
      }

      // 成就解锁检查
      const pendingAchievements = result.pending_achievements || []
      if (pendingAchievements.length > 0) {
        wx.hideLoading()
        this.setData({
          achievementQueue: pendingAchievements,
          currentAchievement: pendingAchievements[0],
          showAchievement: true
        })
        return
      }

      if (result.showJoker) {
        wx.hideLoading()
        this.setData({ showJoker: true })
        return
      }

      const pendingTags = result.pending_failure_tags || []
      if (pendingTags.length > 0) {
        wx.hideLoading()
        this.setData({ failureTagQueue: pendingTags, currentFailureTask: pendingTags[0], showFailureTag: true })
        return
      }

      if (result.isNewUser) {
        wx.hideLoading()
        this.setData({ showOnboarding: true })
        return
      }

      const planResult = await callCloud('getTodayPlan', { date: todayString() })
      wx.hideLoading()

      if (planResult && planResult.plan) {
        this.applyPlan(planResult.plan)
      } else {
        // 无计划时也要消费 pendingNewTaskNotice
        const pending = this.data.pendingNewTaskNotice
        if (pending) {
          this.setData({ pendingNewTaskNotice: null })
          setTimeout(() => this._showNewTaskModal(pending), 300)
          return
        }
        const tasksResult = await callCloud('getTasks')
        const pendingTasks = (tasksResult.tasks || []).filter(function(t) { return t.status !== 'completed' })
        if (pendingTasks.length === 0) {
          this.setData({ showRestDay: true })
        }
        // 有待办任务但无计划：保持 planReady:false，显示时长选择器（WXML会自动渲染chip）
      }
    } catch (e) {
      wx.hideLoading()
      console.error('initPage error', e)
    }
  },

  applyPlan(plan) {
    const mainTasks = (plan.selected_task_ids_data || []).map(t => ({
      ...t,
      durationDisplay: minutesToDisplay(t.suggested_minutes || t.estimated_minutes),
      timeDisplay: t.suggested_start_time && t.suggested_end_time
        ? `${t.suggested_start_time} - ${t.suggested_end_time}`
        : '',
      note: t.ai_note || '',
      completed: t.status === 'completed'
    }))

    const fragmentTasks = (plan.fragment_task_ids_data || []).map(t => ({
      ...t,
      durationDisplay: minutesToDisplay(t.estimated_minutes),
      completed: t.status === 'completed'
    }))

    // 计划存在但任务全空（已完成/被删/新任务还没加入计划）→ 显示时长选择器让用户重新规划
    if (mainTasks.length === 0 && fragmentTasks.length === 0) {
      this.setData({ planReady: false, showRestDay: false, showOnboarding: false })
      const self = this
      const notice = this.data.pendingNewTaskNotice
      if (notice) {
        this.setData({ pendingNewTaskNotice: null })
        setTimeout(function() { self._showNewTaskModal(notice) }, 300)
      }
      return
    }

    const hasSchedule = mainTasks.some(t => t.suggested_start_time)
    const busySlots = plan.busy_slots || []

    // 合并任务和忙碌时段，按时间排序
    const scheduleItems = hasSchedule
      ? this.buildScheduleItems(mainTasks, busySlots)
      : mainTasks.map(t => ({ ...t, itemType: 'task' }))

    const totalMinutes = mainTasks.reduce((s, t) => s + (t.suggested_minutes || t.estimated_minutes || 0), 0)
    const bufferMinutes = Math.max(0, (plan.available_hours || 4) * 60 - totalMinutes)

    // 标记最难任务（估时最长的那个）
    const hardestTask = mainTasks.reduce((max, t) =>
      (t.suggested_minutes || t.estimated_minutes || 0) > (max.suggested_minutes || max.estimated_minutes || 0) ? t : max
    , mainTasks[0] || {})
    if (hardestTask && hardestTask._id) {
      mainTasks.forEach(t => { t.isHardest = t._id === hardestTask._id })
    }

    const completedCount = mainTasks.filter(t => t.completed).length
    const almostThere = completedCount > 0 && completedCount === mainTasks.length - 1

    const allTasksDone = mainTasks.length > 0 && mainTasks.every(t => t.completed)
      && fragmentTasks.every(t => t.completed)
    const allDoneQuote = allTasksDone
      ? ALL_DONE_QUOTES[Math.floor(Math.random() * ALL_DONE_QUOTES.length)]
      : ''

    this.setData({
      planReady: true, generating: false,
      mainTasks, fragmentTasks, scheduleItems, hasSchedule,
      aiSummary: plan.plan_text || '', totalMinutes, bufferMinutes,
      availableHours: plan.available_hours, todayPlanId: plan._id,
      scheduleConstraints: plan.schedule_constraints || '',
      showRestDay: false, showOnboarding: false, waitingForSchedule: false,
      allTasksDone, allDoneQuote, almostThere,
      hardestTaskId: hardestTask ? hardestTask._id : null
    })

    // 有待显示的新任务提示
    if (this.data.pendingNewTaskNotice) {
      const notice = this.data.pendingNewTaskNotice
      this.setData({ pendingNewTaskNotice: null })
      const self = this
      setTimeout(function() { self._showNewTaskModal(notice) }, 500)
      return
    }

    // 所有计划任务完成后，检测是否还有今日截止但未加入计划的任务
    const plannedIds = plan.selected_task_ids || []
    this._checkUnplannedTodayTasks(plannedIds)
  },

  _checkUnplannedTodayTasks(plannedIds) {
    const today = todayString()
    const self = this
    callCloud('getTasks').then(function(res) {
      const unplanned = (res.tasks || []).filter(function(t) {
        return t.status === 'pending' &&
               plannedIds.indexOf(t._id) === -1 &&
               t.deadline && t.deadline.startsWith(today)
      })
      self.setData({ unplannedUrgentTasks: unplanned })
    }).catch(function() {})
  },

  buildScheduleItems(tasks, busySlots) {
    const items = [
      ...tasks.map(t => ({ ...t, itemType: 'task' })),
      ...busySlots.map(s => ({ itemType: 'busy', title: s.label, start: s.start, end: s.end, timeDisplay: `${s.start} - ${s.end}` }))
    ]
    items.sort((a, b) => {
      const timeA = a.itemType === 'task' ? (a.suggested_start_time || '99:99') : a.start
      const timeB = b.itemType === 'task' ? (b.suggested_start_time || '99:99') : b.start
      return timeA.localeCompare(timeB)
    })
    return items
  },

  // ── 时长选择 ──
  handleHoursSelect(e) {
    const value = e.currentTarget.dataset.value
    if (value === 0) {
      // 自定义：打开滑动弹窗
      this.setData({ showCustomHoursModal: true, hoursPickerValue: [4, 0] })
      return
    }
    this.setData({ selectedHoursTemp: value, selectedHours: value, waitingForSchedule: true, scheduleInput: '' })
  },

  handleScheduleInput(e) {
    this.setData({ scheduleInput: e.detail.value })
  },

  handleGenerateWithSchedule() {
    const { selectedHoursTemp, scheduleInput } = this.data
    this.setData({ waitingForSchedule: false })
    this.generatePlan(selectedHoursTemp, scheduleInput)
  },

  handleSkipSchedule() {
    const { selectedHoursTemp } = this.data
    this.setData({ waitingForSchedule: false, scheduleInput: '' })
    this.generatePlan(selectedHoursTemp, '')
  },

  async generatePlan(hours, scheduleConstraints = '', retryCount = 0) {
    this.setData({ generating: true })
    wx.showLoading({ title: 'Flow 规划中...', mask: true })
    try {
      const result = await callCloud('generatePlan', {
        availableHours: hours,
        date: todayString(),
        scheduleConstraints
      })
      wx.hideLoading()
      if (result && result.plan) {
        this.applyPlan(result.plan)
      } else if (result && result.message === 'no_tasks') {
        this.setData({ generating: false, planReady: false })
        wx.showModal({
          title: '没有待办任务了',
          content: '所有任务都完成了！去任务清单加几个新任务？',
          confirmText: '去加任务',
          cancelText: '今天休息',
          success: res => {
            if (res.confirm) wx.switchTab({ url: '/pages/tasks/tasks' })
            else this.setData({ showRestDay: true })
          }
        })
      } else {
        this.setData({ generating: false })
        this.showRetryModal(hours, scheduleConstraints, retryCount, result && result.error)
      }
    } catch (e) {
      wx.hideLoading()
      this.setData({ generating: false })
      this.showRetryModal(hours, scheduleConstraints, retryCount, e.message)
    }
  },

  showRetryModal(hours, scheduleConstraints, retryCount, errMsg) {
    const isTimeout = !errMsg || errMsg.includes('timeout') || errMsg.includes('超时')
    const content = isTimeout
      ? 'AI 响应比较慢，可能是网络问题，要重试吗？'
      : `生成失败，要重试吗？`
    wx.showModal({
      title: retryCount === 0 ? '生成失败' : `生成失败（第${retryCount + 1}次）`,
      content,
      confirmText: '重试',
      cancelText: '稍后再说',
      success: res => {
        if (res.confirm) this.generatePlan(hours, scheduleConstraints, retryCount + 1)
      }
    })
  },

  handleRegenerate() {
    // 用自定义弹窗代替actionSheet（actionSheet超过6项在部分设备失效）
    this.setData({ showCustomHoursModal: true, customHoursVal: String(this.data.availableHours || 3), customMinsVal: '0' })
  },

  handleCustomHoursValInput(e) { this.setData({ customHoursVal: e.detail.value }) },
  handleCustomMinsValInput(e) { this.setData({ customMinsVal: e.detail.value }) },
  confirmCustomHours() {
    const hIdx = this.data.hoursPickerValue[0]
    const mIdx = this.data.hoursPickerValue[1]
    const h = hIdx
    const m = [0, 15, 30, 45][mIdx] || 0
    const total = Math.round((h + m / 60) * 10) / 10
    if (total <= 0) { wx.showToast({ title: '请选择有效时长', icon: 'none' }); return }
    this.setData({ showCustomHoursModal: false })
    if (this.data.planReady) {
      this.generatePlan(total, this.data.scheduleConstraints)
    } else {
      this.setData({ planReady: false, selectedHoursTemp: total, selectedHours: total, waitingForSchedule: true, scheduleInput: '' })
    }
  },
  cancelCustomHours() { this.setData({ showCustomHoursModal: false }) },

  handleHoursPickerChange(e) {
    const hIdx = e.detail.value[0]
    const mIdx = e.detail.value[1]
    const h = hIdx
    const m = [0, 15, 30, 45][mIdx] || 0
    this.setData({ hoursPickerValue: [hIdx, mIdx], customHoursVal: String(h), customMinsVal: String(m) })
  },

  _showNewTaskModal(task) {
    wx.hideToast()
    const self = this

    // 无计划或休息日状态：直接刷新让任务进入候选池，走选时长流程
    if (!self.data.planReady || self.data.showRestDay) {
      self.setData({ showRestDay: false, showOnboarding: false, planReady: false })
      wx.showToast({ title: '任务已加入今日待办', icon: 'none', duration: 1500 })
      setTimeout(function() { self.initPage() }, 300)
      return
    }

    // 有计划：询问处理方式
    wx.showModal({
      title: '今日有新任务',
      content: '"' + task.title + '" 今天要做吗？',
      confirmText: 'AI重新规划全部',
      cancelText: '加到末尾不打乱',
      success: function(res) {
        if (res.confirm) {
          self.generatePlan(self.data.availableHours, self.data.scheduleConstraints)
        } else {
          self._appendTaskToTodayPlan(task.taskId)
        }
      }
    })
  },

  _appendTaskToTodayPlan(taskId) {
    const self = this
    if (!taskId) { wx.showToast({ title: '任务ID丢失，请手动重新生成', icon: 'none' }); return }
    wx.showLoading({ title: '加入中...', mask: true })
    callCloud('appendToTodayPlan', { taskId: taskId, planId: self.data.todayPlanId || null }).then(function(res) {
      wx.hideLoading()
      if (res.success && res.task) {
        const t = res.task
        const newEntry = {
          _id: taskId,
          title: t.title,
          estimated_minutes: t.estimated_minutes,
          suggested_minutes: t.estimated_minutes,
          durationDisplay: minutesToDisplay(t.estimated_minutes),
          timeDisplay: '',
          ai_note: '',
          note: '',
          completed: false,
          isHardest: false,
          itemType: 'task'
        }
        const mainTasks = self.data.mainTasks.concat([newEntry])
        const scheduleItems = self.data.scheduleItems.concat([newEntry])
        const total = mainTasks.reduce(function(s, x) { return s + (x.suggested_minutes || x.estimated_minutes || 0) }, 0)
        self.setData({ mainTasks: mainTasks, scheduleItems: scheduleItems, totalMinutes: total, planReady: true })
        wx.showToast({ title: '已加到今日末尾', icon: 'success' })
      }
    }).catch(function() {
      wx.hideLoading()
      wx.showToast({ title: '加入失败', icon: 'none' })
    })
  },

  quickSelectHours(e) {
    const h = parseFloat(e.currentTarget.dataset.h)
    this.setData({ showCustomHoursModal: false })
    if (this.data.planReady) {
      this.generatePlan(h, this.data.scheduleConstraints)
    } else {
      this.setData({ planReady: false, selectedHoursTemp: h, selectedHours: h, waitingForSchedule: true, scheduleInput: '' })
    }
  },

  handleRegenerateSame() {
    this.generatePlan(this.data.availableHours || 4, this.data.scheduleConstraints)
  },

  // ── 任务勾选 ──
  async handleTaskCheck(e) {
    const { id } = e.currentTarget.dataset
    const mainTaskIndex = this.data.mainTasks.findIndex(t => t._id === id)
    if (mainTaskIndex < 0) return
    const task = this.data.mainTasks[mainTaskIndex]
    if (task.completed) return

    const tasks = [...this.data.mainTasks]
    tasks[mainTaskIndex] = { ...task, completed: true }
    this.setData({ mainTasks: tasks })

    const scheduleItems = this.data.scheduleItems.map(item =>
      item._id === id ? { ...item, completed: true } : item
    )
    const allTasksDone = tasks.every(t => t.completed) && this.data.fragmentTasks.every(t => t.completed)
    const allDoneQuote = allTasksDone
      ? ALL_DONE_QUOTES[Math.floor(Math.random() * ALL_DONE_QUOTES.length)]
      : this.data.allDoneQuote

    // 临门一脚：还差1件
    const remaining = tasks.filter(t => !t.completed).length
    const almostThere = remaining === 1 && tasks.some(t => t.completed)

    // 最难任务完成反馈
    const isHardest = id === this.data.hardestTaskId
    let hardestBannerText = ''
    let showHardestBanner = false
    if (isHardest && !allTasksDone) {
      hardestBannerText = '今天最难的一件，刚才搞定了 💪'
      showHardestBanner = true
      setTimeout(() => this.setData({ showHardestBanner: false }), 3000)
    }

    this.setData({ scheduleItems, allTasksDone, allDoneQuote, almostThere, showHardestBanner, hardestBannerText })

    const allDone = tasks.every(t => t.completed)

    // 弹出时间校准收集器
    this.setData({
      showTimeTracker: true,
      trackingTaskId: id,
      trackingTaskTitle: task.title,
      trackingIsLastTask: allDone
    })
  },

  async handleTimeAccuracy(e) {
    const accuracy = e.currentTarget.dataset.accuracy
    const { trackingTaskId, trackingIsLastTask } = this.data
    this.setData({ showTimeTracker: false })

    if (trackingIsLastTask) wx.showLoading({ title: '记录中...', mask: true })
    try {
      const res = await callCloud('completeTask', {
        taskId: trackingTaskId,
        planId: this.data.todayPlanId,
        timeAccuracy: accuracy
      })
      if (trackingIsLastTask) {
        wx.hideLoading()
        this.setData({ streak: res.streak || this.data.streak })
        this.showCompletionScreen(this.data.mainTasks.length)
      }
    } catch (e) {
      if (trackingIsLastTask) wx.hideLoading()
      const tasks = [...this.data.mainTasks]
      const idx = tasks.findIndex(t => t._id === trackingTaskId)
      if (idx >= 0) tasks[idx] = { ...tasks[idx], completed: false }
      this.setData({ mainTasks: tasks })
    }
  },

  handleSkipTimeTracker() {
    const { trackingTaskId, trackingIsLastTask } = this.data
    this.setData({ showTimeTracker: false })
    if (trackingIsLastTask) wx.showLoading({ title: '记录中...', mask: true })
    callCloud('completeTask', { taskId: trackingTaskId, planId: this.data.todayPlanId })
      .then(res => {
        if (trackingIsLastTask) {
          wx.hideLoading()
          this.setData({ streak: res.streak || this.data.streak })
          this.showCompletionScreen(this.data.mainTasks.length)
        }
      })
      .catch(() => { if (trackingIsLastTask) wx.hideLoading() })
  },

  async handleFragmentCheck(e) {
    const { id } = e.currentTarget.dataset
    const fragIndex = this.data.fragmentTasks.findIndex(t => t._id === id)
    if (fragIndex < 0) return
    const task = this.data.fragmentTasks[fragIndex]
    const tasks = [...this.data.fragmentTasks]
    tasks[fragIndex] = { ...task, completed: !task.completed }
    this.setData({ fragmentTasks: tasks })
    callCloud('completeTask', { taskId: id, planId: this.data.todayPlanId }).catch(() => {})
  },

  toggleFragments() {
    this.setData({ showFragments: !this.data.showFragments })
  },

  // ── 完成庆祝 ──
  showCompletionScreen(count) {
    // 先弹情绪选择，选完再庆祝
    this.setData({ showMoodPicker: true, completedCount: count })
  },

  handleMoodSelect(e) {
    const mood = e.currentTarget.dataset.mood
    this.setData({ showMoodPicker: false, todayMood: mood })
    callCloud('saveMood', { mood }).catch(() => {})
    this.showActualCompletion(this.data.completedCount)
  },

  handleSkipMood() {
    this.setData({ showMoodPicker: false })
    this.showActualCompletion(this.data.completedCount)
  },

  showActualCompletion(count) {
    const msg = COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]
    this.setData({ showCompletion: true, completionMessage: msg })
    const day = new Date().getDay()
    if (day === 5) this.setData({ showFridayPlanning: true })
    this.generateShareImage(count)
  },

  generateShareImage(count) {
    const { streak, totalMinutes, dateDisplay } = this.data
    try {
      const ctx = wx.createCanvasContext('shareCanvas', this)
      const W = 300, H = 440

      // 背景
      ctx.setFillStyle('#1E3A8A')
      ctx.fillRect(0, 0, W, H)

      // 装饰圆
      ctx.setFillStyle('rgba(255,255,255,0.06)')
      ctx.beginPath(); ctx.arc(260, 60, 110, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(40, 390, 90, 0, Math.PI * 2); ctx.fill()

      // App 名
      ctx.setFillStyle('rgba(255,255,255,0.55)')
      ctx.setFontSize(13)
      ctx.setTextAlign('left')
      ctx.fillText('FlowCast', 22, 34)

      // 日期
      ctx.setFillStyle('rgba(255,255,255,0.4)')
      ctx.setFontSize(12)
      ctx.setTextAlign('right')
      ctx.fillText(dateDisplay, W - 22, 34)

      // 主标题
      ctx.setFillStyle('#FFFFFF')
      ctx.setFontSize(26)
      ctx.setTextAlign('center')
      ctx.fillText('今天，我赢了。', W / 2, 110)

      // 完成数量
      ctx.setFontSize(68)
      ctx.setFillStyle('#FFFFFF')
      ctx.fillText(`${count}`, W / 2, 200)
      ctx.setFontSize(16)
      ctx.setFillStyle('rgba(255,255,255,0.65)')
      ctx.fillText('件任务已完成', W / 2, 230)

      // 用时
      ctx.setFontSize(14)
      ctx.setFillStyle('rgba(255,255,255,0.5)')
      ctx.fillText(`共 ${totalMinutes} 分钟`, W / 2, 260)

      // Streak
      ctx.setFillStyle('#FDE68A')
      ctx.setFontSize(19)
      ctx.fillText(`🔥 连续高效第 ${streak} 天`, W / 2, 310)

      // 底部 slogan
      ctx.setFillStyle('rgba(255,255,255,0.35)')
      ctx.setFontSize(12)
      ctx.fillText('Flow 陪你高效地活着', W / 2, 415)

      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'shareCanvas',
          x: 0, y: 0, width: W, height: H,
          destWidth: 600, destHeight: 880,
          success: res => this.setData({ shareImagePath: res.tempFilePath }),
          fail: () => { }
        }, this)
      })
    } catch (e) { }
  },

  onShareAppMessage() {
    const { completedCount, streak, shareImagePath } = this.data
    return {
      title: `我今天完成了 ${completedCount} 件任务，连续第 ${streak} 天 🔥`,
      imageUrl: shareImagePath || '',
      path: '/pages/index/index'
    }
  },

  // ── 周五预载 ──
  handleFridayNoteInput(e) {
    this.setData({ fridayNote: e.detail.value })
  },

  async handleSaveFridayNote() {
    const { fridayNote } = this.data
    if (!fridayNote.trim()) {
      this.setData({ showFridayPlanning: false })
      return
    }
    try {
      await callCloud('saveWeeklyNote', { note: fridayNote.trim() })
      this.setData({ fridayNoteSaved: true })
      setTimeout(() => this.setData({ showFridayPlanning: false, fridayNote: '', fridayNoteSaved: false }), 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  handleSkipFridayPlanning() {
    this.setData({ showFridayPlanning: false })
  },

  // ── 番茄钟 ──
  handleStartPomodoro(e) {
    const { id, title } = e.currentTarget.dataset
    wx.vibrateShort({ type: 'light' })
    const startTime = Date.now()
    this.setData({
      showPomodoro: true,
      pomodoroTaskId: id,
      pomodoroTaskTitle: title,
      pomodoroPhase: 'focus',
      pomodoroSeconds: 25 * 60,
      pomodoroDisplay: '25:00',
      pomodoroProgress: 0,
      pomodoroStartTime: startTime
    })
    this._startPomodoroTick()
    // 云端持久化
    callCloud('savePomodoroState', { action: 'start', taskId: id, taskTitle: title, startTime, phase: 'focus', totalSeconds: 25 * 60 }).catch(() => {})
  },

  _startPomodoroTick() {
    if (this._pomodoroTimer) clearInterval(this._pomodoroTimer)
    const totalSeconds = this.data.pomodoroPhase === 'focus' ? 25 * 60 : 5 * 60
    this._pomodoroTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.data.pomodoroStartTime) / 1000)
      const remaining = Math.max(0, totalSeconds - elapsed)
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      const progress = Math.min(1, elapsed / totalSeconds)
      this.setData({
        pomodoroSeconds: remaining,
        pomodoroDisplay: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        pomodoroProgress: progress
      })
      if (remaining <= 0) {
        clearInterval(this._pomodoroTimer)
        this._pomodoroTimer = null
        wx.vibrateShort({ type: 'heavy' })
        this._onPomodoroPhaseEnd()
      }
    }, 500)
  },

  _onPomodoroPhaseEnd() {
    if (this.data.pomodoroPhase === 'focus') {
      const count = this.data.pomodoroCount + 1
      this.setData({ pomodoroCount: count, pomodoroPhase: 'break', pomodoroStartTime: Date.now() })
      wx.showModal({
        title: `🍅 第 ${count} 个番茄完成！`,
        content: '休息5分钟，或直接标记任务完成？',
        confirmText: '休息5分钟',
        cancelText: '标为完成',
        success: res => {
          if (res.confirm) {
            this._startPomodoroTick()
          } else {
            this.handlePomodoroComplete()
          }
        }
      })
    } else {
      // 休息结束
      this.setData({ pomodoroPhase: 'focus', pomodoroStartTime: Date.now() })
      wx.showModal({
        title: '休息结束',
        content: '继续专注？',
        confirmText: '继续',
        cancelText: '先停下',
        success: res => {
          if (res.confirm) {
            this._startPomodoroTick()
          } else {
            this.handleAbandonPomodoro()
          }
        }
      })
    }
  },

  handlePomodoroComplete() {
    if (this._pomodoroTimer) { clearInterval(this._pomodoroTimer); this._pomodoroTimer = null }
    const taskId = this.data.pomodoroTaskId
    this.setData({ showPomodoro: false, pomodoroTaskId: null })
    // 自动触发任务完成
    const idx = this.data.mainTasks.findIndex(t => t._id === taskId)
    if (idx >= 0 && !this.data.mainTasks[idx].completed) {
      this.handleTaskCheck({ currentTarget: { dataset: { id: taskId } } })
    }
  },

  handleAbandonPomodoro() {
    if (this._pomodoroTimer) { clearInterval(this._pomodoroTimer); this._pomodoroTimer = null }
    this.setData({ showPomodoro: false, pomodoroTaskId: null })
    callCloud('savePomodoroState', { action: 'end' }).catch(() => {})
  },

  handleRequestNextPush() {
    wx.requestSubscribeMessage({
      tmplIds: ['J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'],
      success: () => {
        callCloud('savePushAuth', { date: todayString() }).catch(() => {})
        this.dismissCompletion()
      },
      fail: () => this.dismissCompletion()
    })
  },

  dismissCompletion() { this.setData({ showCompletion: false }) },

  // ── 今天休息 ──
  async handleRestDay() {
    wx.showLoading({ title: '记录中...', mask: true })
    try {
      const res = await callCloud('markRestDay')
      wx.hideLoading()
      this.setData({ restDayDone: true, streak: res.streak || this.data.streak })
      wx.showToast({ title: '好好休息 🌙', icon: 'none', duration: 2000 })
    } catch (e) { wx.hideLoading() }
  },

  nextOnboardingStep() {
    const next = this.data.onboardingStep + 1
    if (next >= 3) {
      this.setData({ onboardingStep: 3 }) // 第4步：习惯设置
    } else {
      this.setData({ onboardingStep: next })
    }
  },

  handleHabitsWakeTime(e) { this.setData({ 'habitsForm.wakeTime': e.detail.value }) },
  handleHabitsSleepTime(e) { this.setData({ 'habitsForm.sleepTime': e.detail.value }) },
  handleHabitsLunchBreak(e) { this.setData({ 'habitsForm.hasLunchBreak': e.currentTarget.dataset.val === 'true' }) },
  handleHabitsLunchStart(e) { this.setData({ 'habitsForm.lunchStart': e.detail.value }) },
  handleHabitsLunchEnd(e) { this.setData({ 'habitsForm.lunchEnd': e.detail.value }) },

  async saveHabitsAndContinue() {
    const f = this.data.habitsForm
    try {
      await callCloud('saveSchedulePreferences', {
        wakeTime: f.wakeTime, sleepTime: f.sleepTime,
        hasLunchBreak: f.hasLunchBreak, lunchStart: f.lunchStart, lunchEnd: f.lunchEnd,
        hasDinnerBreak: f.hasDinnerBreak, dinnerStart: f.dinnerStart, dinnerEnd: f.dinnerEnd,
        weekendDifferent: f.weekendDifferent, weekendWakeTime: f.weekendWakeTime, weekendSleepTime: f.weekendSleepTime
      })
    } catch (e) { }
    wx.navigateTo({ url: '/pages/add-task/add-task' })
  },

  handleHabitsDinnerBreak(e) { this.setData({ 'habitsForm.hasDinnerBreak': e.currentTarget.dataset.val === 'true' }) },
  handleHabitsDinnerStart(e) { this.setData({ 'habitsForm.dinnerStart': e.detail.value }) },
  handleHabitsDinnerEnd(e) { this.setData({ 'habitsForm.dinnerEnd': e.detail.value }) },
  handleHabitsWeekend(e) { this.setData({ 'habitsForm.weekendDifferent': e.currentTarget.dataset.val === 'true' }) },
  handleHabitsWeekendWake(e) { this.setData({ 'habitsForm.weekendWakeTime': e.detail.value }) },
  handleHabitsWeekendSleep(e) { this.setData({ 'habitsForm.weekendSleepTime': e.detail.value }) },

  skipHabits() {
    wx.navigateTo({ url: '/pages/add-task/add-task' })
  },

  goAddFirstTask() {
    wx.navigateTo({ url: '/pages/add-task/add-task' })
  },

  // ── 免死金牌 ──
  async handleUseJoker() {
    wx.showLoading({ title: '使用中...', mask: true })
    try {
      await callCloud('useJoker')
      wx.hideLoading()
      this.setData({ showJoker: false, jokerCount: this.data.jokerCount - 1 })
      wx.showToast({ title: `Streak 保住了 🔥`, icon: 'none', duration: 2000 })
      setTimeout(() => this.initPage(), 500)
    } catch (e) { wx.hideLoading() }
  },

  handleJokerSkip() {
    this.setData({ showJoker: false, streak: 0 })
    setTimeout(() => this.initPage(), 300)
  },

  // ── 成就系统 ──
  dismissAchievement() {
    const queue = this.data.achievementQueue.slice(1)
    if (queue.length > 0) {
      this.setData({ achievementQueue: queue, currentAchievement: queue[0] })
    } else {
      this.setData({ showAchievement: false, achievementQueue: [], currentAchievement: null })
      setTimeout(() => this.initPage(), 300)
    }
  },

  // ── 失败原因标签 ──
  async handleFailureTag(e) {
    const reason = e.currentTarget.dataset.reason
    const { currentFailureTask } = this.data
    if (!currentFailureTask) return
    try { await callCloud('addFailureReason', { taskId: currentFailureTask.task_id, reason }) } catch (e) {}
    this.nextFailureTag()
  },

  handleSkipFailureTag() { this.nextFailureTag() },

  nextFailureTag() {
    const queue = this.data.failureTagQueue.slice(1)
    if (queue.length > 0) {
      this.setData({ failureTagQueue: queue, currentFailureTask: queue[0] })
    } else {
      this.setData({ showFailureTag: false, failureTagQueue: [], currentFailureTask: null })
      setTimeout(() => this.initPage(), 300)
    }
  }
})
