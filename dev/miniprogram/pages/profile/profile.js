const { callCloud } = require('../../utils/api')

Page({
  data: {
    streak: 0,
    totalDays: 0,
    totalCompleted: 0,
    settings: { defaultHours: 4, aiTone: 'friendly' },
    aiToneOptions: [
      { label: '温暖朋友', value: 'friendly' },
      { label: '严厉教练', value: 'strict' },
      { label: '毒舌朋友', value: 'snarky' }
    ],
    weekStats: { completed: 0, rate: 0 },
    chartBars: [],
    weeklySummary: '',
    loadingSummary: false,
    calibrationDataPoints: 0,
    calibrationUnlocked: false,
    calibrationProgress: 0,
    achievements: [],
    achievementBadges: [],
    unlockLevel: 0,
    unlockProgress: null,
    activeDays: 0,
    moodLogs: [],
    moodSummary: '',
    challenge: null,
    challengeHasJoined: false,
    challengeProgress: 0,
    challengeProgressPct: 0,
    challengeParticipants: 0,
    challengeDaysLeft: 0,
    challengeCompleted: false
  },

  onShow() {
    this.loadStats()
  },

  async loadStats() {
    try {
      const result = await callCloud('getUserInfo')
      const logs = (result.weekStats && result.weekStats.logs) || []

      // 固定生成7天柱，没有数据的天显示 0
      const today = new Date()
      const chartBars = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const log = logs.find(l => l.date === dateStr)
        const rate = log
          ? (log.planned > 0 ? Math.min(100, Math.round((log.completed / log.planned) * 100)) : (log.isRestDay ? 100 : 0))
          : 0
        chartBars.push({
          date: `${d.getMonth()+1}/${d.getDate()}`,
          rate,
          isRestDay: log ? (log.isRestDay || false) : false,
          completed: log ? (log.completed || 0) : 0,
          hasData: !!log
        })
      }

      const calibrationDataPoints = result.calibrationDataPoints || 0
      const UNLOCK_THRESHOLD = 10
      const BADGE_MAP = {
        first_complete: { emoji: '🌱', name: '起步' },
        tasks_10: { emoji: '🎯', name: '十件成就' },
        tasks_50: { emoji: '💪', name: '效率达人' },
        tasks_100: { emoji: '🚀', name: '百件英雄' },
        streak_3: { emoji: '🔥', name: '初燃' },
        streak_7: { emoji: '⚡', name: '一周战将' },
        streak_30: { emoji: '🏆', name: '月度传奇' }
      }
      const achievements = result.achievements || []
      const achievementBadges = achievements.map(id => BADGE_MAP[id]).filter(Boolean)

      const moodMap = { great: '⚡', good: '😊', tired: '😴', exhausted: '😩' }
      const moodLogs = (result.moodLogs || []).map(l => ({ ...l, emoji: moodMap[l.mood] || '' }))

      this.setData({
        unlockLevel: result.unlockLevel || 0,
        unlockProgress: result.unlockProgress || null,
        activeDays: result.activeDays || 0,
        moodLogs,
        achievements, achievementBadges, streak: result.streak || 0,
        totalDays: result.totalDays || 0,
        totalCompleted: result.totalCompleted || 0,
        settings: result.settings || this.data.settings,
        weekStats: result.weekStats || this.data.weekStats,
        chartBars,
        calibrationDataPoints,
        calibrationUnlocked: result.calibrationUnlocked || false,
        calibrationProgress: Math.min(100, Math.round((calibrationDataPoints / UNLOCK_THRESHOLD) * 100))
      })

      this.loadWeeklySummary()
      this.loadChallenge()
    } catch (e) { }
  },

  async loadWeeklySummary() {
    this.setData({ loadingSummary: true })
    try {
      const result = await callCloud('generateWeeklySummary')
      this.setData({ weeklySummary: result.summary || '', loadingSummary: false })
    } catch (e) {
      this.setData({ loadingSummary: false })
    }
  },

  handleToneSelect(e) {
    const tone = e.currentTarget.dataset.value
    this.setData({ 'settings.aiTone': tone })
    callCloud('updateSettings', { aiTone: tone }).catch(() => {})
  },

  async loadChallenge() {
    try {
      const res = await callCloud('getChallengeInfo')
      if (!res || res.error) return
      const pct = res.challenge
        ? Math.min(100, Math.round((res.userProgress / res.challenge.goal_value) * 100))
        : 0
      this.setData({
        challenge: res.challenge || null,
        challengeHasJoined: res.hasJoined || false,
        challengeProgress: res.userProgress || 0,
        challengeProgressPct: pct,
        challengeParticipants: res.totalParticipants || 0,
        challengeDaysLeft: res.daysRemaining || 0,
        challengeCompleted: res.isCompleted || false
      })
    } catch (e) { }
  },

  async handleJoinChallenge() {
    if (!this.data.challenge) return
    try {
      await callCloud('joinChallenge', { monthKey: this.data.challenge.month_key })
      this.setData({ challengeHasJoined: true })
      wx.showToast({ title: '已加入挑战！', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '加入失败', icon: 'none' })
    }
  },

  onShareAppMessage() {
    const { totalCompleted, streak } = this.data
    const now = new Date()
    const monthStr = `${now.getMonth() + 1}月`
    return {
      title: `${monthStr}我用 FlowCast 完成了 ${totalCompleted} 件任务，连续高效 ${streak} 天 🔥`,
      path: '/pages/index/index'
    }
  }
})
