const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const AVATARS = ['😊', '🎯', '⚡', '🌊', '🔥', '💪', '🚀', '🎨', '🌱', '💎']

const genFriendCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'FC'
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { displayName, avatarEmoji } = event

  try {
    const userRes = await db.collection('users').doc(openid).get()
    const user = userRes.data

    const updates = { updated_at: db.serverDate() }
    if (displayName) updates.display_name = displayName.trim().substring(0, 12)
    if (avatarEmoji) updates.avatar_emoji = avatarEmoji

    // 首次设置时生成好友码（防重复）
    if (!user.friend_code) {
      let code, exists = true
      while (exists) {
        code = genFriendCode()
        const checkRes = await db.collection('users').where({ friend_code: code }).count()
        exists = checkRes.total > 0
      }
      updates.friend_code = code
    }

    await db.collection('users').doc(openid).update({ data: updates })

    const updated = await db.collection('users').doc(openid).get()
    return { success: true, friend_code: updated.data.friend_code, display_name: updated.data.display_name, avatar_emoji: updated.data.avatar_emoji }
  } catch (e) {
    return { error: e.message }
  }
}
