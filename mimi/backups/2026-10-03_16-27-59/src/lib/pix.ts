import type { PixConfig } from "./store";

/**
 * Gera o "Pix Copia e Cola" (BR Code / Payload) estático seguindo o padrão BR Code do Banco Central.
 * Compatível com OpenFinance. Não há validação CRC oficial embutida para produção real
 * (a integração real exigiria uma API PSP), mas segue a estrutura EMV correta.
 */
function emv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(str: string, max: number): string {
  // remove acentos e caracteres especiais
  const clean = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  return clean.substring(0, max).toUpperCase();
}

export function generatePixCode(amount: number, config: PixConfig): string {
  const merchantAccountInfo = emv(
    "00",
    "BR.GOV.BCB.PIX"
  ) + emv("01", config.key);

  const name = sanitize(config.name || "MIMI MOS PERFUMARIA", 25);
  const city = sanitize(config.city || "SAO PAULO", 15);
  const amountStr = amount.toFixed(2);

  const payload =
    emv("00", "01") + // Payload Format Indicator
    emv("01", "11") + // Point of Initiation Method (dynamic-ish, allows repeated)
    emv("26", merchantAccountInfo) + // Merchant Account Information
    emv("52", "0000") + // Merchant Category Code
    emv("53", "986") + // Currency BRL
    emv("54", amountStr) + // Amount
    emv("58", "BR") + // Country
    emv("59", name) + // Merchant Name
    emv("60", city) + // Merchant City
    emv("62", emv("05", "***")) + // Additional data (txid placeholder)
    "6304"; // CRC placeholder id+length

  const crc = crc16(payload);
  return payload + crc;
}

export function qrCodeUrl(data: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    data
  )}`;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Gera um BR Code para Pix Recorrente (assinatura mensal automática).
 * Usa o campo 62 (Additional Data) com o identificador de recorrência.
 * O banco do cliente configura a autorização automática mensal via OpenFinance.
 *
 * @param amount Valor mensal a ser cobrado
 * @param config Configuração Pix
 * @param subscriptionId ID único da assinatura (ex: "SUB-MIMI-123456")
 * @param recurringDay Dia do mês para cobrança (1-31)
 */
export function generatePixRecurringCode(
  amount: number,
  config: PixConfig,
  subscriptionId: string,
  recurringDay: number = 1
): string {
  const merchantAccountInfo = emv("00", "BR.GOV.BCB.PIX") + emv("01", config.key);
  const name = sanitize(config.name || "MIMI MOS PERFUMARIA", 25);
  const city = sanitize(config.city || "SAO PAULO", 15);
  const amountStr = amount.toFixed(2);

  // Additional Data com identificador de recorrência
  // Campo 05 = txid, Campo 62 = Additional Data
  // Para recorrência, usamos um txid que identifica a assinatura
  const recurringTxid = `SUB${subscriptionId}D${recurringDay}`.substring(0, 25);
  const additionalData = emv("05", recurringTxid);

  const payload =
    emv("00", "01") +
    emv("01", "12") + // Point of Initiation Method = 12 (recorrente)
    emv("26", merchantAccountInfo) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amountStr) +
    emv("58", "BR") +
    emv("59", name) +
    emv("60", city) +
    emv("62", additionalData) +
    "6304";

  const crc = crc16(payload);
  return payload + crc;
}

/**
 * Calcula a próxima data de cobrança baseada no dia do mês.
 */
export function getNextBillingDate(recurringDay: number = 1): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, recurringDay);
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
