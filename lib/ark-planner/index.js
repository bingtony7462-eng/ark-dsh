export const name = 'ark-planner';
export const inject = ['ark'];
export function apply(ctx) {
    ctx.effect(() => ctx.ark.registerModule('ark-planner', { stage: 'P2', implemented: false, note: '嘗試紀錄分欄、關卡狀態、ark_next_stage' }));
}
