const IMAGE_EXT = /\.(avif|bmp|gif|ico|jfif|jpe?g|png|svg|webp)$/iu;

export function isImageFileName(name: string): boolean {
  const cut = name.lastIndexOf("/");
  const base = cut === -1 ? name : name.slice(cut + 1);
  return IMAGE_EXT.test(base);
}
