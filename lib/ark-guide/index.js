export const name = 'ark-guide';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-guide', { stage: 'P2', implemented: false, note: 'L1/L2 作業檢索（L3/L4 屬 P5）' }));
}
