export const name = 'ark-strategy';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-strategy', { stage: 'P3', implemented: false, note: 'L5 自主規劃（白名單普通關）' }));
}
