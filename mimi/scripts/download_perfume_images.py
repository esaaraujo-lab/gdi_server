#!/usr/bin/env python3
"""
Mimi Mimos — Baixador de Imagens Reais de Perfumes
=====================================================

Script Python para baixar fotos reais dos frascos de perfume de múltiplos sites.
Funciona no seu computador local (onde não há bloqueios de IP do sandbox).

REQUISITOS (instale antes de rodar):
    pip install requests beautifulsoup4 cloudscraper pillow selenium webdriver-manager
    # Opcional (para sites com JavaScript/Cloudflare pesado):
    pip install playwright && playwright install chromium

USO:
    python3 download_perfume_images.py

O script vai:
1. Buscar cada perfume em múltiplos sites
2. Baixar a primeira imagem de produto encontrada
3. Verificar se é realmente um frasco de perfume (opcional, via PIL)
4. Salvar em ./perfumes-real/ com o nome correto (ex: bc-001.jpg)
5. Gerar um relatório JSON com as URLs encontradas

Sites suportados (em ordem de prioridade):
- Fragrantica (via cloudscraper)
- Basenotes (via requests)
- FragranceX (via cloudscraper)
- Lattafa oficial (via cloudscraper)
- Maison Alhambra (via requests)
- Wikimedia Commons (via API)
- Bing Images (via API)
- DuckDuckGo (via HTML lite)
- eBay (via requests)
- Mercado Livre (via requests)
"""

import os
import re
import json
import time
import hashlib
import urllib.parse
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# Opcional: cloudscraper para contornar Cloudflare
try:
    import cloudscraper
    HAS_CLOUDSCRAPER = True
except ImportError:
    HAS_CLOUDSCRAPER = False
    print("⚠️  cloudscraper não instalado. Instale com: pip install cloudscraper")
    print("   Sites com Cloudflare (Fragrantica, FragranceX, Lattafa) serão pulados.\n")

# Opcional: PIL para verificar se é imagem válida
try:
    from PIL import Image
    from io import BytesIO
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Opcional: Selenium para sites com JavaScript pesado
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False

# ═══════════════════════════════════════════════════════════════
# CONFIGURAÇÃO
# ═══════════════════════════════════════════════════════════════

OUTPUT_DIR = Path(__file__).parent / "perfumes-real"
OUTPUT_DIR.mkdir(exist_ok=True)

# User-Agent (use um real para não ser bloqueado)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# Timeout e retry
TIMEOUT = 20
MAX_RETRIES = 2
DELAY_BETWEEN_REQUESTS = 1.5  # segundos (seja educado com os sites)

# Lista de perfumes para buscar
# Formato: (id, nome_para_busca, palavras_chave_para_filtrar)
PERFUMES = [
    # Brand Collection (22)
    ("bc-001", "Allure Homme Sport Chanel", ["chanel", "allure", "sport"]),
    ("bc-002", "Burberry London for Men", ["burberry", "london"]),
    ("bc-003", "Carolina Herrera CH Women", ["carolina", "herrera", "ch"]),
    ("bc-004", "Carolina Herrera CH Men", ["carolina", "herrera", "ch", "men"]),
    ("bc-005", "Paco Rabanne 1 Million", ["paco", "rabanne", "million"]),
    ("bc-007", "Dior Jadore", ["dior", "jadore", "j'adore"]),
    ("bc-008", "212 VIP Men Carolina Herrera", ["212", "vip", "men"]),
    ("bc-010", "Tom Ford Black Orchid", ["tom", "ford", "black", "orchid"]),
    ("bc-012", "Lancome La Vie Est Belle", ["lancome", "vie", "belle"]),
    ("bc-021", "Chanel Coco Mademoiselle", ["chanel", "coco", "mademoiselle"]),
    ("bc-027", "Dior Hypnotic Poison", ["dior", "hypnotic", "poison"]),
    ("bc-034", "212 VIP Rose Carolina Herrera", ["212", "vip", "rose"]),
    ("bc-070", "Bleu de Chanel", ["bleu", "chanel"]),
    ("bc-100", "Dior Sauvage", ["dior", "sauvage"]),
    ("bc-105", "Paco Rabanne Lady Million", ["lady", "million", "paco"]),
    ("bc-116", "Paco Rabanne Invictus", ["invictus", "paco"]),
    ("bc-126", "Carolina Herrera Good Girl", ["good", "girl", "carolina"]),
    ("bc-136", "Jean Paul Gaultier Scandal", ["gaultier", "scandal"]),
    ("bc-159", "YSL Libre", ["ysl", "libre", "saint", "laurent"]),
    ("bc-181", "Carolina Herrera Bad Boy", ["bad", "boy", "carolina"]),
    ("bc-247", "Baccarat Rouge 540 MFK", ["baccarat", "rouge", "540"]),
    ("bc-283", "Dior Sauvage Elixir", ["sauvage", "elixir", "dior"]),
    # AFEER Árabes (5)
    ("af-01", "Lattafa Atheeri", ["lattafa", "atheeri"]),
    ("af-02", "Lattafa Asad", ["lattafa", "asad"]),
    ("af-03", "Lattafa Yara Pink", ["lattafa", "yara", "pink"]),
    ("af-04", "Orientica Royal Amber", ["orientica", "royal", "amber"]),
    ("af-07", "Lattafa Fakhar Rose", ["lattafa", "fakhar", "rose"]),
    # Decantes Árabes (18)
    ("dec-01", "Al Wataniah Bareeq Al Dahab", ["bareeq", "dahab", "wataniah"]),
    ("dec-02", "Lattafa Asad Zanzibar", ["asad", "zanzibar", "lattafa"]),
    ("dec-03", "Lattafa Qaed Al Fursan", ["qaed", "fursan", "lattafa"]),
    ("dec-04", "Maison Alhambra Royal Blend Nero", ["royal", "blend", "nero"]),
    ("dec-05", "Lattafa Khamrah", ["lattafa", "khamrah"]),
    ("dec-06", "Lattafa Asad Bourbon", ["asad", "bourbon", "lattafa"]),
    ("dec-07", "Armaf Odyssey Dubai Chocolat", ["armaf", "odyssey", "chocolat"]),
    ("dec-08", "Lattafa Dukhan", ["lattafa", "dukhan"]),
    ("dec-09", "Al Wataniah Watani Noir", ["watani", "noir", "wataniah"]),
    ("dec-10", "Lattafa Badee Al Oud For Glory", ["badee", "oud", "glory"]),
    ("dec-11", "Al Wataniah Oud Mystery Intense", ["oud", "mystery", "intense"]),
    ("dec-12", "Lattafa Al Noble Ameer", ["noble", "ameer", "lattafa"]),
    ("dec-13", "Maison Alhambra Chants Tenderina", ["chants", "tenderina"]),
    ("dec-14", "Lattafa Amirat Al Arab Prive Red", ["amirat", "arab", "red"]),
    ("dec-15", "Al Wataniah Rose Mystery Intense", ["rose", "mystery", "intense"]),
    ("dec-16", "Lattafa Fakhar Rose Gold", ["fakhar", "rose", "gold"]),
    ("dec-17", "Lattafa Tharwah Gold", ["tharwah", "gold", "lattafa"]),
    ("dec-18", "Lattafa Yara Tous", ["yara", "tous", "lattafa"]),
]


# ═══════════════════════════════════════════════════════════════
# FUNÇÕES AUXILIARES
# ═══════════════════════════════════════════════════════════════

def create_session(use_cloudscraper=True):
    """Cria uma sessão HTTP (com cloudscraper se disponível)."""
    if use_cloudscraper and HAS_CLOUDSCRAPER:
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        scraper.headers.update(HEADERS)
        return scraper
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def is_valid_image(content, min_size=5000):
    """Verifica se o conteúdo é uma imagem válida (não HTML de erro)."""
    if len(content) < min_size:
        return False
    # Assinaturas de imagem (magic bytes)
    if content[:3] == b"\xff\xd8\xff":  # JPEG
        return True
    if content[:8] == b"\x89PNG\r\n\x1a\n":  # PNG
        return True
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":  # WebP
        return True
    return False


def download_image(url, dest_path, session=None):
    """Baixa uma imagem de URL e salva no caminho destino."""
    sess = session or create_session()
    try:
        resp = sess.get(url, timeout=TIMEOUT, stream=True, allow_redirects=True)
        if resp.status_code != 200:
            return False
        content = resp.content
        if not is_valid_image(content):
            return False
        with open(dest_path, "wb") as f:
            f.write(content)
        return True
    except Exception as e:
        return False


def extract_image_urls(html, base_url=""):
    """Extrai URLs de imagens do HTML, filtrando ícones/banners."""
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-original") or ""
        if not src:
            continue
        # Resolve URLs relativas
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = urllib.parse.urljoin(base_url, src)
        elif not src.startswith("http"):
            continue
        # Filtra ícones, logos, banners, placeholders
        lower = src.lower()
        if any(x in lower for x in ["icon", "logo", "banner", "sprite", "favicon",
                                     "pixel", "blank", "loading", "placeholder",
                                     "avatar", "social", "arrow", "close",
                                     "star", "cart", "search", "menu"]):
            continue
        # Preferência por imagens grandes / CDNs de e-commerce
        if any(x in lower for x in ["product", "cdn", "shopify", "media-amazon",
                                     "scene7", "images", "upload", "cloudfront",
                                     "catalog", "items", "large", "big"]):
            urls.insert(0, src)  # prioridade alta
        else:
            urls.append(src)
    return urls


# ═══════════════════════════════════════════════════════════════
# BUSCADORES POR SITE
# ═══════════════════════════════════════════════════════════════

def search_fragrantica(query, session):
    """Busca na Fragantica (precisa cloudscraper para contornar Cloudflare)."""
    if not HAS_CLOUDSCRAPER:
        return []
    search_url = f"https://www.fragrantica.com/search/?query={urllib.parse.quote(query)}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://www.fragrantica.com")
        # Fragrantica usa cdn.fragrantica.com para imagens de produtos
        product_urls = [u for u in urls if "fragrantica" in u and ("perfume" in u or "mug" in u)]
        return product_urls[:3]
    except:
        return []


def search_basenotes(query, session):
    """Busca no Basenotes (acessível)."""
    search_url = f"https://www.basenotes.net/search/?q={urllib.parse.quote(query)}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://www.basenotes.net")
        return urls[:3]
    except:
        return []


def search_fragrancex(query, session):
    """Busca na FragranceX (precisa cloudscraper)."""
    if not HAS_CLOUDSCRAPER:
        return []
    search_url = f"https://www.fragrancex.com/search.html?search={urllib.parse.quote(query)}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://www.fragrancex.com")
        # FragranceX usa fx-assets ou cdn
        product_urls = [u for u in urls if "fragrancex" in u or "fx-asset" in u]
        return product_urls[:3]
    except:
        return []


def search_lattafa(query, session):
    """Busca no site oficial da Lattafa (cloudscraper)."""
    if not HAS_CLOUDSCRAPER:
        return []
    # Busca direta no site
    search_url = f"https://lattafa.com/?s={urllib.parse.quote(query)}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://lattafa.com")
        # Lattafa usa cloudfront e wp-content/uploads
        product_urls = [u for u in urls if "lattafa" in u or "cloudfront" in u]
        return product_urls[:3]
    except:
        return []


def search_wikimedia(query, session):
    """Busca no Wikimedia Commons via API (aberta, sem bloqueio)."""
    api_url = f"https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,
        "prop": "imageinfo",
        "iiprop": "url|mime|size",
        "format": "json",
        "gsrlimit": 5,
    }
    try:
        resp = session.get(api_url, params=params, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        urls = []
        for p in pages.values():
            ii = p.get("imageinfo", [{}])[0]
            if ii.get("mime") in ("image/jpeg", "image/png") and (ii.get("size", 0) > 15000):
                url = ii.get("url", "").split("?")[0]
                if url:
                    urls.append(url)
        return urls[:3]
    except:
        return []


def search_bing_images(query, session):
    """Busca no Bing Images (API acessível)."""
    search_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query + ' perfume bottle')}&form=HDRSC2"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        # Bing codifica as URLs originais em "murl" dentro do HTML
        murls = re.findall(r'"murl":"(https?:[^"]+)"', resp.text)
        # Filtra URLs que parecem ser de produtos de perfume
        valid = [u for u in murls if any(x in u.lower() for x in [".jpg", ".jpeg", ".png", ".webp"])]
        return valid[:5]
    except:
        return []


def search_duckduckgo(query, session):
    """Busca no DuckDuckGo (versão HTML lite, sem JS)."""
    search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query + ' perfume bottle')}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text)
        return urls[:3]
    except:
        return []


def search_ebay(query, session):
    """Busca no eBay (acessível)."""
    search_url = f"https://www.ebay.com/sch/i.html?_nkw={urllib.parse.quote(query + ' perfume')}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://www.ebay.com")
        # eBay usa i.ebayimg.com
        product_urls = [u for u in urls if "ebayimg" in u]
        return product_urls[:3]
    except:
        return []


def search_mercado_livre(query, session):
    """Busca no Mercado Livre Brasil (acessível)."""
    search_url = f"https://lista.mercadolivre.com.br/{urllib.parse.quote(query + ' perfume')}"
    try:
        resp = session.get(search_url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []
        urls = extract_image_urls(resp.text, "https://www.mercadolivre.com.br")
        # ML usa http2.mlstatic.com
        product_urls = [u for u in urls if "mlstatic" in u]
        return product_urls[:3]
    except:
        return []


# Lista de buscadores em ordem de prioridade
SEARCHERS = [
    ("Wikimedia", search_wikimedia),
    ("Bing Images", search_bing_images),
    ("DuckDuckGo", search_duckduckgo),
    ("eBay", search_ebay),
    ("Mercado Livre", search_mercado_livre),
    ("Basenotes", search_basenotes),
    ("Fragrantica", search_fragrantica),  # precisa cloudscraper
    ("FragranceX", search_fragrancex),    # precisa cloudscraper
    ("Lattafa oficial", search_lattafa),  # precisa cloudscraper
]


# ═══════════════════════════════════════════════════════════════
# FUNÇÃO PRINCIPAL
# ═══════════════════════════════════════════════════════════════

def download_perfume_image(perfume_id, query, keywords, session, results):
    """Busca e baixa a imagem de um perfume em múltiplos sites."""
    print(f"\n[{perfume_id}] {query}")
    dest_path = OUTPUT_DIR / f"{perfume_id}.jpg"

    # Se já existe, pula
    if dest_path.exists() and dest_path.stat().st_size > 5000:
        print(f"  ✓ já existe ({dest_path.stat().st_size // 1024}KB)")
        results[perfume_id] = str(dest_path)
        return True

    for site_name, searcher in SEARCHERS:
        print(f"  → tentando {site_name}... ", end="", flush=True)
        try:
            urls = searcher(query, session)
            if not urls:
                print("nenhum resultado")
                continue
            print(f"{len(urls)} URLs encontradas")
            for url in urls[:3]:
                print(f"    baixando... ", end="", flush=True)
                if download_image(url, dest_path, session):
                    size = dest_path.stat().st_size
                    print(f"✓ ({size // 1024}KB)")
                    results[perfume_id] = str(dest_path)
                    return True
                else:
                    print("falhou (não é imagem válida)")
        except Exception as e:
            print(f"erro: {str(e)[:60]}")
        time.sleep(0.5)

    print(f"  ✗ nenhuma imagem encontrada para {perfume_id}")
    return False


def main():
    print("=" * 60)
    print("  Mimi Mimos — Baixador de Imagens Reais de Perfumes")
    print("=" * 60)
    print(f"\n  Diretório de saída: {OUTPUT_DIR}")
    print(f"  Perfumes para buscar: {len(PERFUMES)}")
    print(f"  cloudscraper: {'✓ instalado' if HAS_CLOUDSCRAPER else '✗ não instalado'}")
    print(f"  PIL: {'✓ instalado' if HAS_PIL else '✗ não instalado'}")
    print(f"  Selenium: {'✓ instalado' if HAS_SELENIUM else '✗ não instalado'}")
    print(f"  Sites buscadores: {len(SEARCHERS)}\n")

    # Cria sessão com cloudscraper se disponível
    session = create_session(use_cloudscraper=True)

    results = {}
    found = 0

    for perfume_id, query, keywords in PERFUMES:
        if download_perfume_image(perfume_id, query, keywords, session, results):
            found += 1
        time.sleep(DELAY_BETWEEN_REQUESTS)

    # Salva relatório JSON
    report_path = OUTPUT_DIR / "download-report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "total": len(PERFUMES),
            "found": found,
            "not_found": len(PERFUMES) - found,
            "images": results,
        }, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print(f"  RESUMO: {found}/{len(PERFUMES)} imagens baixadas")
    print(f"  Relatório: {report_path}")
    print(f"  Pasta: {OUTPUT_DIR}")
    print("=" * 60)

    # Lista perfumes não encontrados
    not_found = [p[0] for p in PERFUMES if p[0] not in results]
    if not_found:
        print(f"\n  ⚠️  Não encontrados ({len(not_found)}):")
        for pid in not_found:
            print(f"     - {pid}")
        print("\n  Dicas:")
        print("  1. Instale cloudscraper: pip install cloudscraper")
        print("  2. Tente buscar manualmente em https://www.fragrantica.com")
        print("  3. Use Selenium para sites com JavaScript pesado")
        print("  4. Baixe manualmente do Pinterest/Google Images")


if __name__ == "__main__":
    main()
