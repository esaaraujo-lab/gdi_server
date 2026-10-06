import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * API de Cálculo de Frete.
 * CEP de origem da loja: 03923-095
 * Tenta Correios primeiro; se falhar, usa valores estimados baseados na distância.
 */

interface ShippingOption {
  code: number;
  name: string;
  price: number;
  days: number;
  error?: string;
}

const ORIGIN_CEP = "03923095";

async function calcCorreios(
  service: string,
  cepDestino: string
): Promise<ShippingOption> {
  const params = new URLSearchParams({
    sCepOrigem: ORIGIN_CEP,
    sCepDestino: cepDestino,
    nVlPeso: "0.3",
    nCdFormato: "1",
    nVlComprimento: "20",
    nVlAltura: "10",
    nVlLargura: "15",
    nCdServico: service,
    nCdEmpresa: "",
    sDsSenha: "",
    nVlDiametro: "0",
    nVlValorDeclarado: "0",
    sCdMaoPropria: "n",
    StrRetorno: "json",
  });

  try {
    const res = await fetch(
      `https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?${params}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }
    );
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { 
      // Fallback XML
      const valorMatch = text.match(/<Valor>([\d,.]+)<\/Valor>/);
      const prazoMatch = text.match(/<PrazoEntrega>(\d+)<\/PrazoEntrega>/);
      if (valorMatch) {
        return {
          code: parseInt(service),
          name: service === "04510" ? "PAC" : "SEDEX",
          price: parseFloat(valorMatch[1].replace(",", ".")),
          days: prazoMatch ? parseInt(prazoMatch[1]) : 0,
        };
      }
      return { code: parseInt(service), name: service === "04510" ? "PAC" : "SEDEX", price: 0, days: 0, error: "Correios sem resposta" };
    }

    const servico = data?.Servicos?.cServico?.[0] || data?.Servicos?.cServico;
    if (!servico) return { code: parseInt(service), name: service === "04510" ? "PAC" : "SEDEX", price: 0, days: 0, error: "Sem resposta" };

    const valorStr = servico.Valor?.replace(",", ".") || "0";
    const price = parseFloat(valorStr);
    const days = parseInt(servico.PrazoEntrega || "0");

    if (servico.Erro && servico.Erro !== "0") {
      return { code: parseInt(service), name: service === "04510" ? "PAC" : "SEDEX", price: 0, days: 0, error: servico.MsgErro || "Erro" };
    }

    return { code: parseInt(service), name: service === "04510" ? "PAC" : "SEDEX", price, days };
  } catch {
    return { code: parseInt(service), name: service === "04510" ? "PAC" : "SEDEX", price: 0, days: 0, error: "Indisponível" };
  }
}

// Valores estimados quando Correios não responde
function getEstimatedShipping(cepDestino: string): { pac: ShippingOption; sedex: ShippingOption } {
  // Estimativa baseada na região do CEP (primeiro dígito)
  const region = parseInt(cepDestino[0]);
  const isSP = cepDestino.startsWith("0") || cepDestino.startsWith("1");
  
  if (isSP) {
    return {
      pac: { code: "04510", name: "PAC", price: 15.90, days: 3 },
      sedex: { code: "04014", name: "SEDEX", price: 25.90, days: 1 },
    };
  }
  // Outras regiões
  const basePac = 20 + region * 2;
  const baseSedex = 35 + region * 3;
  return {
    pac: { code: "04510", name: "PAC", price: basePac, days: 5 + region },
    sedex: { code: "04014", name: "SEDEX", price: baseSedex, days: 2 + Math.floor(region / 2) },
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cep = url.searchParams.get("cep");

  if (!cep || cep.replace(/\D/g, "").length !== 8) {
    return NextResponse.json(
      { error: "CEP inválido. Informe 8 dígitos.", options: [] },
      { status: 400 }
    );
  }

  const cleanCep = cep.replace(/\D/g, "");

  // Tenta Correios com timeout de 8s
  const timeoutPromise = new Promise<ShippingOption>((resolve) =>
    setTimeout(() => resolve({ code: 0, name: "Timeout", price: 0, days: 0, error: "timeout" }), 8000)
  );

  const [pacResult, sedexResult] = await Promise.all([
    Promise.race([calcCorreios("04510", cleanCep), timeoutPromise]),
    Promise.race([calcCorreios("04014", cleanCep), timeoutPromise]),
  ]);

  // Se Correios falhou, usa estimativa
  const hasError = (s: ShippingOption) => s.error || s.price === 0;
  
  let finalPac = pacResult;
  let finalSedex = sedexResult;
  
  if (hasError(pacResult) || hasError(sedexResult)) {
    const estimated = getEstimatedShipping(cleanCep);
    if (hasError(pacResult)) finalPac = { ...estimated.pac, error: undefined };
    if (hasError(sedexResult)) finalSedex = { ...estimated.sedex, error: undefined };
  }

  const options: ShippingOption[] = [
    { code: 0, name: "Retirar na Loja", price: 0, days: 0 },
    finalPac,
    finalSedex,
  ];

  return NextResponse.json({
    cep: cleanCep,
    origin: ORIGIN_CEP,
    options,
  });
}
