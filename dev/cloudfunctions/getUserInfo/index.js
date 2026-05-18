const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const yesterdayStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const today = todayStr()
  const yesterday = yesterdayStr()

  try {
    let userDoc
    try {
      userDoc = await db.collection('users').doc(openid).get()
    } catch (e) {
      await db.collection('users').doc(openid).set({
        data: {
          settings: { wake_time: '08:00', default_daily_hours: 4, ai_tone: 'friendly' },
          streak: { current: 0, longest: 0, last_active_date: '', jokers_remaining: 1 },
          pending_failure_tags: [],
          pending_achievements: [],
          achievements: [],
          total_completed: 0,
          is_new_user: true,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
      userDoc = await db.collection('users').doc(openid).get()
    }

    const user = userDoc.data
    const streak = user.streak || { current: 0, longest: 0, last_active_date: '', jokers_remaining: 1 }

    const lastActive = streak.last_active_date || ''
    const streakBroken = lastActive && lastActive !== today && lastActive !== yesterday
    const showJoker = streakBroken && (streak.jokers_remaining || 0) > 0 && streak.current > 0

    const [pendingCountRes, calibrationRes] = await Promise.all([
      db.collection('tasks').where({ user_id: openid, status: db.command.neq('completed') }).count(),
      db.collection('tasks').where({ user_id: openid, status: 'completed', time_accuracy: db.command.neq(null) }).count()
    ])

    const hasAnyTasks = pendingCountRes.total > 0
    const calibrationDataPoints = calibrationRes.total || 0
    const calibrationUnlocked = calibrationDataPoints >= 10

    const logsRes = await db.collection('daily_logs')
      .where({ user_id: openid })
      .orderBy('log_date', 'desc')
      .limit(30)
      .get()

    const logs = logsRes.data || []
    const recentLogs = logs.slice(0, 7)
    const weekCompleted = recentLogs.reduce((s, l) => s + (l.tasks_completed || 0), 0)
    const weekPlanned = recentLogs.reduce((s, l) => s + (l.tasks_planned || 0), 0)

    // 有效活跃天数：当天有真实完成任务或主动标记休息才算（单天刷再多只算1天，防刷）
    const activeDays = logs.filter(l => (l.tasks_completed || 0) > 0 || l.is_rest_day).length
    const totalCompleted = user.total_completed || 0
    const calibrationCount = calibrationDataPoints || 0
    const longestStreak = (user.streak && user.streak.longest) || 0

    // 分层解锁等级（基于行为质量，非数量，防止刷任务）
    // 第1章：5个有效活跃天（刷单天完成再多也只算1天）
    // 第2章：12天有效使用 AND 5次时间校准（必须认真记录实际用时，无法造假）
    // 第3章：22天有效使用 AND 历史最长Streak达7天（必须真实持续使用）
    const unlockLevel =
      (activeDays >= 22 && longestStreak >= 7) ? 3 :
      (activeDays >= 12 && calibrationCount >= 5) ? 2 :
      (activeDays >= 5) ? 1 : 0

    // 各章详细进度（用于profile展示）
    const unlockProgress = {
      activeDays, calibrationCount, longestStreak,
      l1: {
        days: Math.min(activeDays, 5), daysTarget: 5,
        pct: Math.min(100, Math.round(activeDays / 5 * 100))
      },
      l2: {
        days: Math.min(activeDays, 12), daysTarget: 12,
        cals: Math.min(calibrationCount, 5), calsTarget: 5,
        daysPct: Math.min(100, Math.round(activeDays / 12 * 100)),
        calsPct: Math.min(100, Math.round(calibrationCount / 5 * 100))
      },
      l3: {
        days: Math.min(activeDays, 22), daysTarget: 22,
        streak: Math.min(longestStreak, 7), streakTarget: 7,
        daysPct: Math.min(100, Math.round(activeDays / 22 * 100)),
        streakPct: Math.min(100, Math.round(longestStreak / 7 * 100))
      }
    }

    // 情绪数据（最近7天）
    const moodLogs = recentLogs
      .filter(l => l.mood)
      .map(l => ({ date: l.log_date, mood: l.mood }))

    // 番茄钟持久化
    const activePomodoroRaw = user.active_pomodoro || null
    let activePomodoro = null
    if (activePomodoroRaw && activePomodoroRaw.start_time) {
      const elapsed = Math.floor((Date.now() - activePomodoroRaw.start_time) / 1000)
      const remaining = (activePomodoroRaw.total_seconds || 25 * 60) - elapsed
      if (remaining > 0) {
        activePomodoro = { ...activePomodoroRaw, remaining, elapsed }
      }
    }

    // 取出待显示的成就，然后清空队列
    const pendingAchievements = user.pending_achievements || []
    if (pendingAchievements.length > 0) {
      await db.collection('users').doc(openid).update({ data: { pending_achievements: [] } })
    }

    return {
      openid,
      streak: streak.current || 0,
      jokers_remaining: streak.jokers_remaining || 0,
      showJoker,
      isNewUser: !hasAnyTasks,
      pending_failure_tags: user.pending_failure_tags || [],
      pending_achievements: pendingAchievements,
      achievements: user.achievements || [],
      total_completed: totalCompleted,
      calibrationDataPoints,
      calibrationUnlocked,
      unlockLevel,
      unlockProgress,
      activeDays,
      moodLogs,
      activePomodoro,
      settings: user.settings || {},
      totalDays: recentLogs.length,
      totalCompleted: weekCompleted,
      weekStats: {
        completed: weekCompleted,
        rate: weekPlanned > 0 ? Math.min(100, Math.round((weekCompleted / weekPlanned) * 100)) : 0,
        logs: logs.map(l => ({ date: l.log_date, completed: l.tasks_completed || 0, planned: l.tasks_planned || 0, isRestDay: l.is_rest_day || false }))
      }
    }
  } catch (e) {
    console.error('getUserInfo error:', e)
    return { error: e.message, openid }
  }
}
