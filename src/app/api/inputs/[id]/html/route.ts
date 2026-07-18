import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inputs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// Conteúdo completo de um input, carregado sob demanda (ao expandir "Ler na
// íntegra"). Devolve o HTML original do e-mail — que preserva os hyperlinks —
// e o texto puro como fallback.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select({ html: inputs.html, bodyText: inputs.bodyText })
    .from(inputs).where(eq(inputs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ html: row.html ?? null, bodyText: row.bodyText ?? "" });
}
