# 📸 Baixador de Imagens Reais de Perfumes — Mimi Mimos

Script Python para baixar fotos reais dos frascos de perfume de múltiplos sites.

## 🚀 Instalação Rápida

```bash
# 1. Instalar Python 3.8+ (se não tiver)
# Download: https://www.python.org/downloads/

# 2. Instalar dependências
pip install requests beautifulsoup4 cloudscraper pillow

# 3. (Opcional) Para sites com JavaScript pesado (Sephora, Macy's)
pip install selenium webdriver-manager

# 4. (Opcional) Para contornar Cloudflare avançado
pip install playwright
playwright install chromium
```

## 📋 Como Usar

```bash
# Rodar o script (baixa todas as imagens para ./perfumes-real/)
python3 download_perfume_images.py

# Com mensagem personalizada no relatório
python3 download_perfume_images.py --output ./minhas-imagens
```

## 🌐 Sites Suportados (25 sites)

### Sites Acessíveis (funcionam direto)
| # | Site | URL | Observação |
|---|---|---|---|
| 1 | Wikimedia Commons | commons.wikimedia.org | API aberta, melhor para fotos com licença |
| 2 | Bing Images | bing.com/images | API acessível, boa cobertura |
| 3 | DuckDuckGo | duckduckgo.com | Versão HTML lite |
| 4 | eBay | ebay.com | Acessível, fotos reais de produtos |
| 5 | Mercado Livre BR | mercadolivre.com.br | E-commerce brasileiro |
| 6 | Basenotes | basenotes.net | Banco de dados de perfumes |
| 7 | Maison Alhambra | maison-alhambra.com | Site oficial da marca árabe |
| 8 | Al Wataniah | alwataniah.com | Site oficial da marca árabe |
| 9 | Notino | notino.com.br | Varejista europeu |
| 10 | Ulta | ulta.com | Varejista americano |
| 11 | Nordstrom | shop.nordstrom.com | Loja de departamento |
| 12 | Jomashop | jomashop.com | E-commerce com preços |
| 13 | PerfumeRep | perfumereps.com | Réplicas de perfumes |
| 14 | Decant Store | decantstore.com | Decantes e amostras |

### Sites com Cloudflare (precisam cloudscraper)
| # | Site | URL | Observação |
|---|---|---|---|
| 15 | Fragrantica | fragrantica.com | Melhor fonte de fotos oficiais + notas |
| 16 | FragranceX | fragrancex.com | E-commerce com fotos oficiais |
| 17 | FragranceNet | fragrancenet.com | E-commerce acessível |
| 18 | Lattafa oficial | lattafa.com | Site oficial da marca árabe |
| 19 | Sephora | sephora.com | Fotos oficiais de marcas |
| 20 | Macy's | macys.com | Loja de departamento |
| 21 | Parfumo | parfumo.com | Comunidade + reviews |
| 22 | Pinterest | pinterest.com | Precisa login para API |

### Sites com Bloqueio Pesado (precisam Selenium)
| # | Site | URL | Observação |
|---|---|---|---|
| 23 | Amazon | amazon.com | Bloqueia bots, use Selenium |
| 24 | Google Images | images.google.com | CAPTCHA, use Selenium |
| 25 | Instagram | instagram.com | Precisa login |

## 🔧 Configuração Avançada

### Editar lista de perfumes
Abra `download_perfume_images.py` e edite a lista `PERFUMES`:

```python
PERFUMES = [
    ("bc-001", "Allure Homme Sport Chanel", ["chanel", "allure"]),
    ("bc-002", "Burberry London for Men", ["burberry", "london"]),
    # ... adicione mais perfumes aqui
]
```

### Mudar diretório de saída
```python
OUTPUT_DIR = Path(__file__).parent / "minha-pasta"  # padrão: ./perfumes-real/
```

### Ajustar delay entre requisições (seja educado com os sites)
```python
DELAY_BETWEEN_REQUESTS = 2.0  # segundos (aumente se for bloqueado)
```

## 📊 Estrutura do Relatório

O script gera `./perfumes-real/download-report.json`:

```json
{
  "total": 45,
  "found": 38,
  "not_found": 7,
  "images": {
    "bc-001": "/caminho/para/bc-001.jpg",
    "bc-002": "/caminho/para/bc-002.jpg",
    ...
  }
}
```

## 🆘 Troubleshooting

### "cloudscraper não instalado"
```bash
pip install cloudscraper
```

### "Connection refused" / "403 Forbidden"
- Aumente o `DELAY_BETWEEN_REQUESTS` para 3-5 segundos
- Use uma VPN se seu IP foi bloqueado
- Tente rodar em horários diferentes

### Imagens erradas (não correspondem ao perfume)
- Adicione mais palavras-chave na lista `PERFUMES`
- Use o filtro `keywords` para validar (já implementado)

### Sites com Cloudflare persistente
- Use a versão Selenium (abaixo)
- Ou baixe manualmente do Fragrantica/Pinterest

## 🎯 Versão com Selenium (para sites difíceis)

Se os sites acima não funcionarem, use esta versão com Chrome automatizado:

```python
# selenium_downloader.py — versão avançada
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import time, os

# Configura Chrome em modo headless (sem interface)
options = Options()
options.add_argument("--headless")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

# Abre Google Images
driver.get("https://images.google.com")
search_box = driver.find_element(By.NAME, "q")
search_box.send_keys("Lattafa Khamrah perfume bottle")
search_box.send_keys(Keys.RETURN)
time.sleep(3)

# Pega primeira imagem de resultado
images = driver.find_elements(By.CSS_SELECTOR, "img[src*='images']")
if images:
    img_url = images[0].get_attribute("src")
    # Baixa a imagem
    import requests
    resp = requests.get(img_url, timeout=20)
    with open("khamrah.jpg", "wb") as f:
        f.write(resp.content)
    print("✓ Imagem baixada!")

driver.quit()
```

## 📥 Sites Recomendados por Tipo de Perfume

### Brand Collection (Chanel, Dior, Paco Rabanne, etc.)
1. **Fragrantica** — melhor fonte, fotos oficiais + notas olfativas
2. **FragranceX** — e-commerce com fotos profissionais
3. **Sephora** — fotos oficiais das marcas
4. **Wikimedia Commons** — licença livre

### AFEER / Árabes (Lattafa, Al Wataniah, Maison Alhambra)
1. **Lattafa oficial** (lattafa.com) — fotos oficiais
2. **Maison Alhambra** (maison-alhambra.com) — fotos oficiais
3. **Al Wataniah** (alwataniah.com) — fotos oficiais
4. **eBay** — vendedores com fotos reais
5. **Mercado Livre** — vendedores brasileiros

### Decantes
1. **Decant Store** (decantstore.com) — especializada em decantes
2. **PerfumeRep** (perfumereps.com) — réplicas e decantes
3. **eBay** — decantes de vendedores
4. **Etsy** — decantes artesanais

## 💡 Dicas Pro

1. **Use VPN** se seu IP for bloqueado (Brasil pode ter restrições em sites EUA)
2. **Rodar à noite** tem menos chance de bloqueio (tráfego menor)
3. **Respeite os termos** de cada site (não sobrecarregue)
4. **Verifique direitos autorais** antes de usar comercialmente
5. **Fragrantica** é a melhor fonte — tem fotos oficiais + notas olfativas completas
6. **Wikimedia Commons** tem licença livre (seguro para uso comercial)

## 📞 Suporte

Se algum perfume não for encontrado:
1. Verifique se o nome está correto na lista `PERFUMES`
2. Tente buscar manualmente no Fragrantica
3. Use a versão Selenium para sites difíceis
4. Baixe manualmente do Pinterest/Google Images e renomeie o arquivo

---

**Desenvolvido para Mimi Mimos — Haute Parfumerie**
