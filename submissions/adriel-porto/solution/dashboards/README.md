# As 2 ferramentas

⚠️ **Estas páginas não rodam aqui no GitHub.** São HTML + JavaScript que lêem os CSVs de `data/` — o GitHub mostra o código-fonte, não a página. Para ver funcionando, são dois comandos:

```bash
cd solution/dashboards
python3 -m http.server 8787
```

| Ferramenta | Abra em | O que faz |
|---|---|---|
| `dashboard-churn-004-origem` | http://localhost:8787/dashboard-churn-004-origem/ | Diagnóstico completo: filtro em funil progressivo e 7 seções que recalculam ao vivo. Aplica a metodologia própria — entrada real vs trial, upgrade/downgrade datado no dia exato, e cancelamento medido **por valor perdido**, não por quantidade |
| `dashboard-churn-005-trafego` | http://localhost:8787/dashboard-churn-005-trafego/ | Faturamento real por origem (`referral_source`) + simulação de investimento em Ads |

Nenhuma das duas escreve nos arquivos: só lê, calcula em memória e exibe.

Detalhes em [`../COMO-RODAR.md`](../COMO-RODAR.md).
