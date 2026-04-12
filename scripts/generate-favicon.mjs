import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/**
 * 与 assets/favicon.svg 一致的俯视键盘（坐标为 32×32 逻辑单位）
 * @param {number} size 输出边长（16 或 32）
 */
function pianoIconPng(size) {
  const png = new PNG({ width: size, height: size });
  const { data } = png;
  const s = size / 32;

  const setPx = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (size * y + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  };

  const fillRect = (x0, y0, x1, y1, r, g, b) => {
    const X0 = Math.max(0, Math.floor(x0 * s));
    const Y0 = Math.max(0, Math.floor(y0 * s));
    const X1 = Math.min(size, Math.ceil(x1 * s));
    const Y1 = Math.min(size, Math.ceil(y1 * s));
    for (let y = Y0; y < Y1; y += 1) {
      for (let x = X0; x < X1; x += 1) {
        setPx(x, y, r, g, b);
      }
    }
  };

  fillRect(0, 0, size, size, 10, 10, 10);

  const whites = [
    [2, 6, 5.6, 28],
    [6.2, 6, 9.8, 28],
    [10.4, 6, 13.9, 28],
    [14.6, 6, 18.2, 28],
    [18.8, 6, 22.4, 28],
    [23, 6, 26.6, 28],
    [27.2, 6, 29.8, 28]
  ];
  for (const [x0, y0, x1, y1] of whites) {
    fillRect(x0, y0, x1, y1, 250, 250, 250);
  }

  const blacks = [
    [4.1, 6, 6.3, 19],
    [8.3, 6, 10.5, 19],
    [16.7, 6, 18.9, 19],
    [20.9, 6, 23.1, 19],
    [25.1, 6, 27.3, 19]
  ];
  for (const [x0, y0, x1, y1] of blacks) {
    fillRect(x0, y0, x1, y1, 23, 23, 23);
  }

  return PNG.sync.write(png);
}

const png32 = pianoIconPng(32);
const png16 = pianoIconPng(16);
const ico = await pngToIco([png32, png16]);
writeFileSync(path.join(root, "assets/favicon.ico"), ico);
