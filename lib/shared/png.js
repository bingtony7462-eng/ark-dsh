/** 截圖有效性判定（純程式碼）：可解碼、尺寸、是否全黑或單色。 */
import { PNG } from 'pngjs';
const MIN_W = 1280;
const MIN_H = 720;
export function checkPng(buf) {
    let png;
    try {
        png = PNG.sync.read(buf);
    }
    catch (e) {
        return { valid: false, width: null, height: null, mean_luma: null, luma_stddev: null, black: false, uniform: false, reason: `PNG 無法解碼: ${e.message}` };
    }
    const { width, height, data } = png;
    // 取 64x36 格網抽樣，避免整張掃描
    const gx = 64, gy = 36;
    let sum = 0, sum2 = 0, n = 0;
    for (let j = 0; j < gy; j++) {
        for (let i = 0; i < gx; i++) {
            const x = Math.min(width - 1, Math.floor((i + 0.5) * width / gx));
            const y = Math.min(height - 1, Math.floor((j + 0.5) * height / gy));
            const o = (y * width + x) * 4;
            const l = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
            sum += l;
            sum2 += l * l;
            n++;
        }
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const black = mean < 8 && sd < 4;
    const uniform = sd < 1.5;
    let reason = null;
    if (black)
        reason = '畫面全黑';
    else if (uniform)
        reason = '畫面為單一顏色';
    else if (width < MIN_W || height < MIN_H)
        reason = `解析度過低 ${width}x${height}（需 ≥ ${MIN_W}x${MIN_H}）`;
    return {
        valid: reason === null,
        width, height,
        mean_luma: Math.round(mean * 10) / 10,
        luma_stddev: Math.round(sd * 10) / 10,
        black, uniform, reason,
    };
}
