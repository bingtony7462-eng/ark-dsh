export const name = 'ark-guard';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-guard', { stage: 'P1', implemented: false, note: '資源硬限制、熔斷、權限門禁、通知；未載入前其他插件只能查詢' }));
}
