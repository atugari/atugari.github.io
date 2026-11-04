import QRCode from './qr-code.js';

export function drawPairQR(canvas, value) {
  const code = QRCode(0, 'L');
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const quiet = 4;
  const scale = 5;
  canvas.width = canvas.height = (count + quiet * 2) * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (code.isDark(row, column)) context.fillRect((column + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }
}
