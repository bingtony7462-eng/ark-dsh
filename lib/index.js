import * as core from "./ark-core/index.js";
import * as device from "./ark-device/index.js";
import * as maa from "./ark-maa/index.js";
import * as guard from "./ark-guard/index.js";
import * as box from "./ark-box/index.js";
import * as guide from "./ark-guide/index.js";
import * as copilot from "./ark-copilot/index.js";
import * as planner from "./ark-planner/index.js";
import * as strategy from "./ark-strategy/index.js";
export const name = 'ark-dsh';
export const inject = ['tools'];
export function apply(ctx) {
    ctx.plugin(core, {});
    ctx.plugin(device, {});
    ctx.plugin(maa, {});
    ctx.plugin(guard);
    ctx.plugin(box);
    ctx.plugin(guide);
    ctx.plugin(copilot);
    ctx.plugin(planner);
    ctx.plugin(strategy);
}
export { core, device, maa, guard, box, guide, copilot, planner, strategy };
export { registerArkTool, getArkToolDeclaration, listArkToolDeclarations } from "./shared/tool-helpers.js";
