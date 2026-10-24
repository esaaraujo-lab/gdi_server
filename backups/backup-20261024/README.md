# Backup 20261024 — esaaraujo-lab/gdi_server (PUBLIC)

## Informações do backup

| Campo | Valor |
|-------|-------|
| **Repo** | esaaraujo-lab/gdi_server |
| **Visibility** | 🌐 public |
| **Data do backup** | 20261024 |
| **Source commit SHA** | c6c09939af288ff93788badc82a4455a0641572c |
| **Source tag** | backup-20261024 |
| **Tarball** | gdi_server-backup-20261024.tar.gz |
| **Tamanho** | 24M |
| **SHA-256** | ced54fb8caa0ddadf72a682dc8c22a97991fc06f8e4d36713bb2dd4749ee2e2d |
| **Arquivos no tarball** | 455 |

## Como restaurar

```bash
# 1. Baixar o tarball via GitHub API
curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/esaaraujo-lab/gdi_server/tarball/backup-20261024" \
  -o gdi_server-backup-20261024.tar.gz

# 2. Verificar integridade
echo "ced54fb8caa0ddadf72a682dc8c22a97991fc06f8e4d36713bb2dd4749ee2e2d  gdi_server-backup-20261024.tar.gz" | sha256sum -c

# 3. Extrair
tar -xzf gdi_server-backup-20261024.tar.gz
cd esaaraujo-lab-gdi_server-c6c0993

# 4. Restaurar git history (opcional)
git init
git remote add origin https://github.com/esaaraujo-lab/gdi_server.git
git fetch origin backup-20261024
git checkout backup-20261024
```

## Tag no GitHub

🔗 https://github.com/esaaraujo-lab/gdi_server/releases/tag/backup-20261024

## Downloads diretos (via API)

- **Tarball:** `GET https://api.github.com/repos/esaaraujo-lab/gdi_server/tarball/backup-20261024`
- **Zipball:** `GET https://api.github.com/repos/esaaraujo-lab/gdi_server/zipball/backup-20261024`

---

*Backup gerado em 2026-10-24T14:24:34+00:00 via GitHub API.*
