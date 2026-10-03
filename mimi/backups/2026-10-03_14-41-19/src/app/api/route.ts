import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    message: "Mimi Mimos API",
    endpoints: {
      "/api/products": "Lista todos os produtos",
      "/api/health": "Health check",
      "/api/admin-login": "Login admin (POST)",
      "/api/pix": "Gera Pix BR Code (POST)",
      "/api/leads": "Captura leads (POST)",
      "/api/promotions": "Lista promoções",
      "/api/shipping": "Calcula frete (GET)",
    },
  });
}
