import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Rota de autenticação do Admin (segura — hash SHA-256 não reversível).
 * Compatível com Cloudflare Workers (edge runtime) via Web Crypto API.
 *
 * A senha NÃO fica em texto puro nem em Base64 (que é reversível).
 * Usamos SHA-256 com salt estático — hash não pode ser revertido para a senha.
 *
 * POST /api/admin-login  body: { password: string }
 *
 * Para alterar a senha: gere um novo hash com:
 *   echo -n "SALT_NOVO + SUA_SENHA" | sha256sum
 * e atualize ADMIN_PASS_SHA256 abaixo + ADMIN_SALT se desejar.
 */

// Salt e hash — usam variáveis de ambiente no Cloudflare (wrangler.toml [vars])
const ADMIN_SALT = process.env.ADMIN_SALT || "mimi_mimos_2026_luxury_parfumerie_salt_x9k";
const ADMIN_PASS_SHA256 =
  process.env.ADMIN_PASS_HASH || "80d6e227beaa8e47b15965e737bc6d01f36578c7f482de31ff1675409f9ce4a1";

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string };
    const password = body.password || "";

    // Dev bypass: only in explicit development mode, accept "admin123"
    // Use positive check (===) to avoid activating in production when NODE_ENV is undefined
    if (process.env.NODE_ENV === "development" && password === "admin123") {
      return NextResponse.json({ success: true, source: "dev-bypass" });
    }

    // Hash com salt — não reversível
    const inputHash = await sha256(ADMIN_SALT + password);
    const isAuth = inputHash === ADMIN_PASS_SHA256;
    // Adiciona delay anti-brute-force (300ms)
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({
      success: isAuth,
      // Não revela qual campo está errado
      error: isAuth ? undefined : "Credenciais inválidas",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "payload inválido" },
      { status: 400 }
    );
  }
}

export async function GET() {
  // Não revela informações sobre a rota
  return NextResponse.json({ error: "Método não permitido" }, { status: 405 });
}
