const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CHALLENGES = {
  1:  { title: '新年挑战', desc: '连续10天完成计划', goal_type: 'streak', goal_value: 10 },
  2:  { title: '二月特训', desc: '完成25件任务',     goal_type: 'tasks',  goal_value: 25 },
  3:  { title: '春季冲刺', desc: '连续12天高效',     goal_type: 'streak', goal_value: 12 },
  4:  { title: '四月加速', desc: '完成35件任务',     goal_type: 'tasks',  goal_value: 35 },
  5:  { title: '五月挑战', desc: '连续14天完成计划', goal_type: 'streak', goal_value: 14 },
  6:  { title: '仲夏专注', desc: '完成40件任务',     goal_type: 'tasks',  goal_value: 40 },
  7:  { title: '七月坚持', desc: '连续15天高效',     goal_type: 'streak', goal_value: 15 },
  8:  { title: '丰收冲刺', desc: '完成45件任务',     goal_type: 'tasks',  goal_value: 45 },
  9:  { title: '金秋挑战', desc: '连续16天完成计划', goal_type: 'streak', goal_value: 16 },
  10: { title: '十月突破', desc: '完成50件任务',     goal_type: 'tasks',  goal_value: 50 },
  11: { title: '年末冲刺', desc: '连续18天高效',     goal_type: 'streak', goal_value: 18 },
  12: { title: '年终传奇', desc: '完成55件任务',     goal_type: 'tasks',  goal_value: 55 }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  const daysRemaining = Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))

  try {
    // 获取或创建本月挑战
    let challengeRes = await db.collection('monthly_challenges').where({ month_key: monthKey }).get()
    let challenge

    if (!challengeRes.data || challengeRes.data.length === 0) {
      const template = CHALLENGES[month]
      challenge = { ...template, month_key: monthKey, start_date: startDate, end_date: endDate, created_at: db.serverDate() }
      await db.collection('monthly_challenges').add({ data: challenge })
    } else {
      challenge = challengeRes.data[0]
    }

    // 用户参与情况
    const partRes = await db.collection('challenge_participants')
      .where({ user_id: openid, month_key: monthKey })
      .get()
    const hasJoined = partRes.data && partRes.data.length > 0

    // 计算用户进度
    let userProgress = 0
    if (hasJoined) {
      if (challenge.goal_type === 'streak') {
        const userRes = await db.collection('users').doc(openid).get().catch(() => ({ data: null }))
        userProgress = userRes.data && userRes.data.streak ? (userRes.data.streak.current || 0) : 0
      } else {
        const logsRes = await db.collection('daily_logs')
          .where({ user_id: openid, log_date: db.command.gte(startDate) })
          .get()
        userProgress = (logsRes.data || []).reduce((s, l) => s + (l.tasks_completed || 0), 0)
      }
    }

    // 总参与人数
    const totalRes = await db.collection('challenge_participants').where({ month_key: monthKey }).count()
    const completedRes = await db.collection('challenge_participants')
      .where({ month_key: monthKey, completed: true })
      .count()

    return {
      challenge,
      hasJoined,
      userProgress,
      daysRemaining,
      totalParticipants: totalRes.total || 0,
      completedCount: completedRes.total || 0,
      isCompleted: userProgress >= challenge.goal_value
    }
  } catch (e) {
    console.error('getChallengeInfo error:', e)
    return { error: e.message }
  }
}
