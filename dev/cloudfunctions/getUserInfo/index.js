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
      .limit(7)
      .get()

    const logs = logsRes.data || []
    const weekCompleted = logs.reduce((s, l) => s + (l.tasks_completed || 0), 0)
    const weekPlanned = logs.reduce((s, l) => s + (l.tasks_planned || 0), 0)

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
      total_completed: user.total_completed || 0,
      calibrationDataPoints,
      calibrationUnlocked,
      settings: user.settings || {},
      totalDays: logs.length,
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
