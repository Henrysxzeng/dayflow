const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const chemistryLevel = (score) => {
  if (score >= 100) return { emoji: '🌊', label: '心流共振', color: '#2563EB' }
  if (score >= 60) return { emoji: '💎', label: '默契十足', color: '#7C3AED' }
  if (score >= 30) return { emoji: '❤️', label: '好友', color: '#DC2626' }
  if (score >= 10) return { emoji: '🔥', label: '升温中', color: '#D97706' }
  return { emoji: '🌱', label: '刚认识', color: '#16A34A' }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 获取所有好友关系
    const friendshipsRes = await db.collection('friendships')
      .where({
        _id: db.command.or([
          { user_a: openid },
          { user_b: openid }
        ])
      })
      .orderBy('chemistry', 'desc')
      .limit(50)
      .get()

    const friendships = friendshipsRes.data || []
    const friendIds = friendships.map(f => f.user_a === openid ? f.user_b : f.user_a)

    if (friendIds.length === 0) return { friends: [], pendingInvites: [] }

    // 获取好友用户信息
    const friendsInfoRes = await db.collection('users')
      .where({ _id: db.command.in(friendIds) })
      .get()

    const friendsMap = {}
    ;(friendsInfoRes.data || []).forEach(u => { friendsMap[u._id] = u })

    const friends = friendships.map(fs => {
      const friendId = fs.user_a === openid ? fs.user_b : fs.user_a
      const info = friendsMap[friendId] || {}
      const level = chemistryLevel(fs.chemistry || 0)
      return {
        friendship_id: fs._id,
        user_id: friendId,
        display_name: info.display_name || 'Flow用户',
        avatar_emoji: info.avatar_emoji || '😊',
        friend_code: info.friend_code || '',
        chemistry: fs.chemistry || 0,
        shared_tasks_completed: fs.shared_tasks_completed || 0,
        level
      }
    })

    // 获取待接受的共同任务邀请
    const pendingRes = await db.collection('shared_tasks')
      .where({ invitee_id: openid, status: 'pending' })
      .get()

    return { friends, pendingInvites: pendingRes.data || [] }
  } catch (e) {
    console.error('getFriendsData error:', e)
    return { error: e.message, friends: [], pendingInvites: [] }
  }
}
