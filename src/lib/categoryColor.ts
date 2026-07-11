// Cada categoria recebe uma cor estável e bem separada, da paleta do refs-catalog.
// Não é a paleta semântica genérica (info-azul/erro-vermelho): aqui a cor é uma
// identidade de categoria, e é consistente entre chips, cards e seções.
const PALETTE = [
  "#0e8ba0", // ciano
  "#7c3aed", // violeta
  "#1f9d54", // verde
  "#c07d0a", // âmbar
  "#e8551e", // laranja
  "#d61f2b", // vermelho
  "#b0208f", // magenta
  "#5b8c00", // lima
];

const PINNED: Record<string, string> = {
  "ler-depois": "#0e8ba0",
  inspiracao: "#7c3aed",
  pessoal: "#1f9d54",
  outros: "#c07d0a",
};

export function categoryColor(slug: string): string {
  if (PINNED[slug]) return PINNED[slug];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Prominência no bento: pessoal > ler-depois > inspiração > outros.
// 4 = tile maior (mais destaque), 1 = menor. Categorias novas = médio (2).
const PRIORITY: Record<string, number> = {
  pessoal: 4,
  "ler-depois": 3,
  inspiracao: 2,
  outros: 1,
};

export function categorySize(slug: string): number {
  return PRIORITY[slug] ?? 2;
}
