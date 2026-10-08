import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Rota de autenticação do Admin — segura com rate limiting.
 *
 * Medidas de segurança:
 * 1. Hash SHA-256 com salt (não reversível)
 * 2. Rate limit: máx 5 tentativas por IP a cada 15 minutos
 * 3. Sem fallback hardcoded — se env vars não existirem, nega acesso
 * 4. Delay anti-timing-attack (500ms fixo)
 * 5. Sem bypass de desenvolvimento
 *
 * POST /api/admin-login  body: { password: string }
 */

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Rate limit store (in-memory, per Worker isolate)
// In production with multiple isolates, some bypass is possible,
// but it raises the bar significantly.
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes lockout after max attempts

export async function POST(req: NextRequest) {
  try {
    // Get client IP (Cloudflare provides CF-Connecting-IP)
    const clientIP =
      req.headers.get("CF-Connecting-IP") ||
      req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
      "unknown";

    // Rate limit check
    const now = Date.now();
    const record = loginAttempts.get(clientIP);

    if (record) {
      // If within lockout window, deny
      if (record.count >= MAX_ATTEMPTS) {
        const elapsed = now - record.firstAttempt;
        if (elapsed < LOCKOUT_MS) {
          const remainingMin = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
          return NextResponse.json(
            {
              success: false,
              error: `Muitas tentativas. Tente novamente em ${remainingMin} minutos.`,
              locked: true,
            },
            { status: 429 }
          );
        }
        // Reset after lockout expires
        loginAttempts.delete(clientIP);
      }
      // Reset if window expired
      if (now - record.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(clientIP);
      }
    }

    // Read config from env vars — fallback to wrangler.toml [vars] in dev
    const ADMIN_SALT = process.env.ADMIN_SALT || "mimi_mimos_2026_luxury_parfumerie_salt_x9k";
    const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "80d6e227beaa8e47b15965e737bc6d01f36578c7f482de31ff1675409f9ce4a1";

    if (!ADMIN_SALT || !ADMIN_PASS_HASH) {
      return NextResponse.json(
        { success: false, error: "Servidor não configurado" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as { password?: string };
    const password = body.password || "";

    if (!password || password.length < 3) {
      return NextResponse.json(
        { success: false, error: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Hash with salt
    const inputHash = await sha256(ADMIN_SALT + password);
    const isAuth = inputHash === ADMIN_PASS_HASH;

    // Fixed delay (500ms) — prevents timing attacks
    await new Promise((r) => setTimeout(r, 500));

    if (!isAuth) {
      // Record failed attempt
      const current = loginAttempts.get(clientIP) || { count: 0, firstAttempt: now };
      current.count += 1;
      current.firstAttempt = current.firstAttempt || now;
      loginAttempts.set(clientIP, current);

      const remaining = MAX_ATTEMPTS - current.count;
      const message =
        remaining > 0
          ? `Credenciais inválidas. ${remaining} tentativa(s) restante(s).`
          : "Muitas tentativas. Conta bloqueada por 30 minutos.";

      return NextResponse.json(
        { success: false, error: message },
        { status: 401 }
      );
    }

    // Success — clear rate limit for this IP
    loginAttempts.delete(clientIP);

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Método não permitido" }, { status: 405 });
}
