const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { friendCode } = event

  try {
    // 查找好友码对应的用户
    const friendRes = await db.collection('users')
      .where({ friend_code: friendCode.toUpperCase() })
      .get()

    if (!friendRes.data || friendRes.data.length === 0) {
      return { success: false, error: '找不到该好友码，确认一下？' }
    }

    const friend = friendRes.data[0]
    if (friend._id === openid) {
      return { success: false, error: '不能添加自己哦' }
    }

    // 检查是否已经是好友
    const existingRes = await db.collection('friendships')
      .where({
        _id: db.command.or([
          { user_a: openid, user_b: friend._id },
          { user_a: friend._id, user_b: openid }
        ])
      })
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      return { success: false, error: '你们已经是好友了' }
    }

    // 建立好友关系
    await db.collection('friendships').add({
      data: {
        user_a: openid,
        user_b: friend._id,
        chemistry: 0,
        shared_tasks_completed: 0,
        created_at: db.serverDate()
      }
    })

    return {
      success: true,
      friend: {
        _id: friend._id,
        display_name: friend.display_name || 'Flow用户',
        avatar_emoji: friend.avatar_emoji || '😊',
        friend_code: friend.friend_code
      }
    }
  } catch (e) {
    console.error('addFriend error:', e)
    return { error: e.message }
  }
}
