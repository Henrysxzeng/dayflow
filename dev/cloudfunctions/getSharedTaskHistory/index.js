const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { friendUserId } = event  // 可选，筛选与某好友的记录

  try {
    const query = friendUserId
      ? db.command.or([
          { creator_id: openid, invitee_id: friendUserId },
          { creator_id: friendUserId, invitee_id: openid }
        ])
      : db.command.or([
          { creator_id: openid },
          { invitee_id: openid }
        ])

    const res = await db.collection('shared_tasks')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(30)
      .get()

    // 补充好友名称
    const tasks = res.data || []
    const friendIds = [...new Set(tasks.map(t => t.creator_id === openid ? t.invitee_id : t.creator_id))]

    let friendsMap = {}
    if (friendIds.length > 0) {
      const friendsRes = await db.collection('users')
        .where({ _id: db.command.in(friendIds) })
        .get()
      ;(friendsRes.data || []).forEach(u => { friendsMap[u._id] = u })
    }

    const enriched = tasks.map(t => {
      const partnerId = t.creator_id === openid ? t.invitee_id : t.creator_id
      const partner = friendsMap[partnerId] || {}
      const myCompleted = t.creator_id === openid ? t.creator_completed : t.invitee_completed
      const partnerCompleted = t.creator_id === openid ? t.invitee_completed : t.creator_completed
      return {
        ...t,
        partner_name: partner.display_name || 'Flow用户',
        partner_emoji: partner.avatar_emoji || '😊',
        my_completed: myCompleted,
        partner_completed: partnerCompleted
      }
    })

    return { tasks: enriched }
  } catch (e) {
    return { error: e.message, tasks: [] }
  }
}
