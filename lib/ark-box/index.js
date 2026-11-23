export const name = 'ark-box';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-box', { stage: 'P2', implemented: false, note: 'Box 匯出、box_query、box_find_substitute' }));
}
