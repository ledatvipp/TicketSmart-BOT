import { parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

try {
  const renderer = new Resvg(workerData.svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: ['noto-sans-regular.ttf', 'noto-sans-bold.ttf', 'press-start-2p.ttf'].map((file) =>
        fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url))),
      defaultFontFamily: 'Noto Sans',
    },
  });
  // Only embedded, validated PNGs are used. Never resolve SVG external resources.
  parentPort.postMessage({ png: renderer.render().asPng() });
} catch {
  parentPort.postMessage({ error: 'Không thể tạo ảnh cấp độ' });
} finally {
  parentPort.close();
}
