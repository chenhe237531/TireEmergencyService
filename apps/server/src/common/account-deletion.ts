/**
 * 账号注销匿名化（ADR-0006）：个人信息清空，工单保留统计骨架。
 *
 * 规则：
 *   1. 司机资料匿名化：手机号、openid、昵称、头像、司机身份清空，status='deleted'
 *   2. 救援工单保留状态、时间与门店，但清空车牌、坐标、位置描述
 *   3. 救援咨询额外清空车型、故障描述、现场图片与联系人、电话
 *   4. 浏览痕迹与本人上传的文件删除
 *   5. 注销后同一手机号可重新注册（phone 置 NULL 释放唯一约束），历史工单留在匿名化账号上，不关联新账号
 */
import type { PrismaClient } from '@prisma/client'

/** 匿名化指定司机并清理关联数据；整个动作在一个事务内完成。幂等：已注销账号再跑一遍无副作用。 */
export async function anonymizeDriver(prisma: PrismaClient, driverId: number) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: driverId } })
    if (!driver) throw new Error(`[delete] 司机不存在：${driverId}`)

    // 救援工单：保留状态/时间/门店骨架，清空个人与位置信息
    await tx.rescueAlert.updateMany({
      where: { driverId },
      data: { plateNo: '', lat: null, lng: null, locationDesc: '' },
    })
    // 救援咨询：额外清空车型、故障描述、现场图片、联系人
    await tx.consultRequest.updateMany({
      where: { driverId },
      data: { plateNo: '', carModel: '', lat: null, lng: null, locationDesc: '', description: '', images: null, contactName: '', contactPhone: '' },
    })
    // 浏览痕迹与本人上传文件删除（上传归属标记见 app.controller upload：driver#<id>）
    await tx.viewLog.deleteMany({ where: { driverId } })
    await tx.uploadFile.deleteMany({ where: { createdBy: `driver#${driverId}` } })

    // 司机资料匿名化；已注销账号重复执行时保持原样（幂等）
    if (driver.status !== 'deleted') {
      await tx.driver.update({
        where: { id: driverId },
        data: { phone: null, openid: null, nickname: '', avatarUrl: '', role: '', status: 'deleted', deletedAt: new Date() },
      })
    }
    return { deleted: true }
  })
}
