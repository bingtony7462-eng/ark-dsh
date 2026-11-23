const ARK_TOOL_DECLARATIONS = new Map();
/** 取得工具的宣告資訊（供 ark-guard 或測試核對；未宣告回 undefined）。 */
export function getArkToolDeclaration(name) {
    return ARK_TOOL_DECLARATIONS.get(name);
}
/** 列出目前所有已宣告的 ark 工具。 */
export function listArkToolDeclarations() {
    return [...ARK_TOOL_DECLARATIONS.values()];
}
/** 統一註冊入口：同時向宣告表與 ctx.tools 登記，卸載時一併清除。 */
export function registerArkTool(ctx, meta, definition) {
    const entry = { name: definition.name, module: meta.module, tier: meta.tier };
    ARK_TOOL_DECLARATIONS.set(definition.name, entry);
    const disposeTool = ctx.tools.register(definition);
    return () => {
        disposeTool();
        if (ARK_TOOL_DECLARATIONS.get(definition.name) === entry) {
            ARK_TOOL_DECLARATIONS.delete(definition.name);
        }
    };
}
/** 所有工具的 render：只輸出精簡 JSON，不輸出長篇文字。 */
export function jsonRender(_args, value) {
    return [{ type: 'text', text: JSON.stringify(value) }];
}
/** 工具輸出統一用開放物件 + json 成員，內容由各模組自行保證結構。 */
export const openObject = { type: 'object', additionalProperties: true };
/** 轉成無 undefined 的純 JSON 物件（工具輸出邊界）。 */
export function asJson(v) {
    return JSON.parse(JSON.stringify(v));
}
