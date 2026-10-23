/**
 * 相册保存能力封装（海报 / 客服二维码共用）。
 *
 * 保存失败统一分类为「权限被拒」与「其他失败」：权限被拒不循环弹窗，
 * 引导一次系统设置后交还用户决定；小程序走 openSetting，App 端跳应用详情页。
 * 注意：vitest 不做条件编译，测试环境按全平台语义运行，
 * 涉及 plus 的分支必须先判断 typeof plus，避免测试环境引用未定义变量。
 */

export type AlbumSaveResult = 'saved' | 'denied' | 'failed'

/**
 * 保存失败分类：errMsg 命中授权拒绝特征视为权限问题，其余按普通失败处理。
 * 各端报错文案不同（saveImageToPhotosAlbum:fail auth deny / no permission 等），
 * 用宽松正则覆盖，宁可错判为权限引导用户去设置，也不要死循环弹保存。
 */
export function classifyAlbumSaveError(errMsg: string): 'denied' | 'failed' {
  return /auth|deny|denied|permission|权限/i.test(String(errMsg || '')) ? 'denied' : 'failed'
}

/** 保存图片到相册，resolve 分类结果（不 reject），调用方按结果决定 UI */
export function saveImageToAlbum(filePath: string): Promise<AlbumSaveResult> {
  return new Promise((resolve) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve('saved'),
      fail: err => resolve(classifyAlbumSaveError(err?.errMsg || '')),
    })
  })
}

/**
 * 相册权限被拒后的系统设置引导（只引导一次，不循环弹窗）：
 *   - MP-WEIXIN：openSetting 打开小程序授权页
 *   - APP-PLUS：跳系统「应用详情」页，由用户手动开启存储权限
 *   - H5：无相册权限概念，提示文案即可
 */
export function openAlbumPermissionSetting() {
  // #ifdef MP-WEIXIN
  uni.openSetting({})
  return
  // #endif
  // #ifdef APP-PLUS
  try {
    const main = plus.android.runtimeMainActivity() as any
    const Intent = plus.android.importClass('android.content.Intent') as any
    const Settings = plus.android.importClass('android.provider.Settings') as any
    const Uri = plus.android.importClass('android.net.Uri') as any
    const intent = new Intent(
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      Uri.fromParts('package', main.getPackageName(), null),
    )
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    main.startActivity(intent)
  }
  catch {
    // 引导失败不再打扰用户，下次保存时仍会给出提示
  }
  return
  // #endif
}
