import { PNG } from "pngjs";

const normalizeHex = (color) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) {
    return [255, 255, 255];
  }

  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
};

export const canvasToPngBuffer = (canvas, size) => {
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const offset = index * 4;
      const [r, g, b] = normalizeHex(canvas[index]);
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = 255;
    }
  }

  return PNG.sync.write(png);
};

