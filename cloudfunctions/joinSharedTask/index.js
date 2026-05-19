const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { sharedTaskId } = event

  try {
    const stRes = await db.collection('shared_tasks').doc(sharedTaskId).get()
    const st = stRes.data

    if (st.invitee_id !== openid) return { error: 'unauthorized' }
    if (st.status !== 'pending') return { error: 'already_joined' }

    // 在自己的任务池创建这个任务
    const myTaskRes = await db.collection('tasks').add({
      data: {
        user_id: openid,
        title: st.task_title,
        description: '',
        deadline: null,
        estimated_minutes: st.estimated_minutes || 30,
        importance: 2,
        quadrant: 'Q2',
        is_fragment: (st.estimated_minutes || 30) <= 10,
        status: 'pending',
        is_shared: true,
        shared_task_id: sharedTaskId,
        fail_history: [], fail_count: 0,
        created_at: db.serverDate()
      }
    })

    await db.collection('shared_tasks').doc(sharedTaskId).update({
      data: { invitee_task_id: myTaskRes._id, status: 'accepted' }
    })

    return { success: true, taskId: myTaskRes._id }
  } catch (e) {
    return { error: e.message }
  }
}
