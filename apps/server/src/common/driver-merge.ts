/**
 * 账号合并（ADR-0002）：同一手机号在微信与安卓渠道产生两个 Driver 时，
 * 把工单与痕迹归并到创建时间更早的主账号，被合并账号保留审计记录。
 *
 * 规则：
 *   1. 主账号 = 创建时间更早者（相同则 id 更小者）
 *   2. 救援工单 / 救援咨询 / 浏览痕迹迁移到主账号
 *   3. 主账号 openid 为空且被合并账号有 openid 时接管该 openid
 *   4. 被合并账号清空 openid 与 phone，status='merged'，写 mergedIntoId / mergedAt
 *   5. 任一账号被封禁时，合并后的主账号保持封禁
 *   6. 每次合并写一条 DriverMergeLog
 */
import type { PrismaClient, Prisma } from '@prisma/client'

export interface MergeInput {
  /** 参与合并的两个司机 id（顺序无关，主账号由创建时间决定） */
  aId: number
  bId: number
  /** 触发合并的手机号（写审计流水用） */
  phone: string
  /** 合并原因：wx-bind-merge 微信绑定 | data-migration 历史数据迁移 */
  reason: string
}

export interface MergeOutput {
  /** 保留的主账号 id */
  primaryId: number
  /** 被合并清空的账号 id */
  loserId: number
}

type Tx = Prisma.TransactionClient

/** 迁移工单前清掉会撞 (driverId, clientRequestId) 唯一约束的幂等键（两个账号极小概率生成过相同 UUID） */
async function clearCollidingClientRequestIds(tx: Tx, loserId: number, primaryId: number) {
  const [loserRescues, loserConsults] = await Promise.all([
    tx.rescueAlert.findMany({ where: { driverId: loserId, clientRequestId: { not: null } }, select: { clientRequestId: true } }),
    tx.consultRequest.findMany({ where: { driverId: loserId, clientRequestId: { not: null } }, select: { clientRequestId: true } }),
  ])
  const keys = [...loserRescues, ...loserConsults].map(r => r.clientRequestId).filter((k): k is string => !!k)
  if (!keys.length)
    return
  const [primaryRescues, primaryConsults] = await Promise.all([
    tx.rescueAlert.findMany({ where: { driverId: primaryId, clientRequestId: { in: keys } }, select: { clientRequestId: true } }),
    tx.consultRequest.findMany({ where: { driverId: primaryId, clientRequestId: { in: keys } }, select: { clientRequestId: true } }),
  ])
  const collided = new Set([...primaryRescues, ...primaryConsults].map(r => r.clientRequestId).filter((k): k is string => !!k))
  if (!collided.size)
    return
  // 撞键的旧记录幂等键置空：保留工单本身，只是不再参与去重
  await tx.rescueAlert.updateMany({ where: { driverId: loserId, clientRequestId: { in: [...collided] } }, data: { clientRequestId: null } })
  await tx.consultRequest.updateMany({ where: { driverId: loserId, clientRequestId: { in: [...collided] } }, data: { clientRequestId: null } })
}

/**
 * 执行账号合并。整个动作在一个事务内完成，任一步失败整体回滚。
 * 幂等性：被合并账号（status='merged'）再次传入会被跳过。
 */
export async function mergeDrivers(prisma: PrismaClient, input: MergeInput): Promise<MergeOutput> {
  return prisma.$transaction(async (tx) => {
    const [a, b] = await Promise.all([
      tx.driver.findUnique({ where: { id: input.aId } }),
      tx.driver.findUnique({ where: { id: input.bId } }),
    ])
    if (!a || !b)
      throw new Error(`[merge] 司机不存在：a=${input.aId} b=${input.bId}`)
    if (a.id === b.id)
      return { primaryId: a.id, loserId: a.id }
    // 已被合并过的账号不重复参与合并
    if (a.status === 'merged' || b.status === 'merged')
      throw new Error(`[merge] 账号已被合并，不能再次合并：a.status=${a.status} b.status=${b.status}`)

    // 主账号 = 创建时间更早者（相同则 id 更小者）
    const primaryFirst
      = a.createdAt.getTime() < b.createdAt.getTime()
        || (a.createdAt.getTime() === b.createdAt.getTime() && a.id < b.id)
    const primary = primaryFirst ? a : b
    const loser = primaryFirst ? b : a

    await clearCollidingClientRequestIds(tx, loser.id, primary.id)

    // 工单与痕迹迁移到主账号
    await tx.rescueAlert.updateMany({ where: { driverId: loser.id }, data: { driverId: primary.id } })
    await tx.consultRequest.updateMany({ where: { driverId: loser.id }, data: { driverId: primary.id } })
    await tx.viewLog.updateMany({ where: { driverId: loser.id }, data: { driverId: primary.id } })

    // 任一账号被封禁时合并后保持封禁
    const banned = primary.status === 'blocked' || loser.status === 'blocked'
    // 主账号是短信注册的默认昵称/头像时，采纳被合并的微信账号资料（更真实）
    const adoptProfile = primary.nickname === '司机用户' || primary.nickname === '微信用户'

    // 先清空被合并账号的 openid/phone：openid 唯一，主账号要接管它就必须先释放
    await tx.driver.update({
      where: { id: loser.id },
      data: { openid: null, phone: null, status: 'merged', mergedIntoId: primary.id, mergedAt: new Date() },
    })

    await tx.driver.update({
      where: { id: primary.id },
      data: {
        phone: input.phone,
        // 主账号 openid 为空且被合并账号有 openid 时接管（openid 唯一，被合并账号随后清空）
        ...(primary.openid == null && loser.openid ? { openid: loser.openid } : {}),
        ...(adoptProfile ? { nickname: loser.nickname, avatarUrl: loser.avatarUrl } : {}),
        ...(banned ? { status: 'blocked' } : {}),
      },
    })

    await tx.driverMergeLog.create({
      data: { fromDriverId: loser.id, toDriverId: primary.id, phone: input.phone, reason: input.reason },
    })

    return { primaryId: primary.id, loserId: loser.id }
  })
}
