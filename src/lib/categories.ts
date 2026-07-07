export const OUTROS_SLUG = "outros";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const DEFAULT_CATEGORIES = [
  { slug: "ler-depois", name: "Ler / Ver depois", sortOrder: 0 },
  { slug: "inspiracao", name: "Inspiração / Referência", sortOrder: 1 },
  { slug: "pessoal", name: "Pessoal / Vida", sortOrder: 2 },
  { slug: OUTROS_SLUG, name: "Outros", sortOrder: 3 },
];
