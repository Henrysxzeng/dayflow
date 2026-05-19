const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { title, estimatedMinutes, deadline, importance, friendUserId } = event

  try {
    // 为自己创建任务
    const myTaskRes = await db.collection('tasks').add({
      data: {
        user_id: openid,
        title, description: '',
        deadline: deadline || null,
        estimated_minutes: estimatedMinutes || 30,
        importance: importance || 2,
        quadrant: 'Q2',
        is_fragment: estimatedMinutes <= 10,
        status: 'pending',
        is_shared: true,
        fail_history: [], fail_count: 0,
        created_at: db.serverDate()
      }
    })

    // 创建共同任务记录
    const sharedRes = await db.collection('shared_tasks').add({
      data: {
        creator_id: openid,
        invitee_id: friendUserId,
        task_title: title,
        estimated_minutes: estimatedMinutes || 30,
        creator_task_id: myTaskRes._id,
        invitee_task_id: null,
        creator_completed: false,
        invitee_completed: false,
        status: 'pending',  // pending → accepted → creator_done / invitee_done → both_done
        created_at: db.serverDate(),
        completed_at: null
      }
    })

    return { success: true, taskId: myTaskRes._id, sharedTaskId: sharedRes._id }
  } catch (e) {
    console.error('createSharedTask error:', e)
    return { error: e.message }
  }
}
