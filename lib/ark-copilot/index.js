export const name = 'ark-copilot';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-copilot', { stage: 'P2', implemented: false, note: '作業校驗、dry-run、演習、失敗歸因' }));
}
