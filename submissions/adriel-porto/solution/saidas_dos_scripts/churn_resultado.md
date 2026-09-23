## 0. Checagens
- accounts: 500 linhas, signup_date de 2023-01-02 a 2024-12-31
- subscriptions: 5000 linhas, start_date de 2023-01-09 a 2024-12-31
- churn_events: 600 linhas, churn_date de 2023-01-25 a 2024-12-31
- support_tickets: 2000 linhas, submitted_at de 2023-01-02 a 2024-12-31
- feature_usage: 25000 linhas, usage_date de 2023-01-01 a 2024-12-31
- eventos de churn: 600 | contas únicas com churn: 352 de 500 (70.4%)
- contas com mais de 1 evento: 175 | máx eventos numa conta: 5
- accounts.churn_flag=True: 110 | em churn_events e flag True: 75 | em churn_events e flag False: 277 | flag True sem evento: 35
- churn_date antes do signup_date: 0
- eventos cujo churn_date bate com algum end_date de assinatura da conta: 6 de 600
- contas com churn que têm assinatura iniciada depois do último churn_date: 284

## 1. Linha do tempo (por churn_date)

### Eventos de churn por mês
| Mês | Eventos |
|---|---|
| 2023-01 | 1 |
| 2023-03 | 5 |
| 2023-04 | 3 |
| 2023-05 | 3 |
| 2023-06 | 5 |
| 2023-07 | 6 |
| 2023-08 | 7 |
| 2023-09 | 6 |
| 2023-10 | 10 |
| 2023-11 | 11 |
| 2023-12 | 16 |
| 2024-01 | 20 |
| 2024-02 | 10 |
| 2024-03 | 24 |
| 2024-04 | 25 |
| 2024-05 | 27 |
| 2024-06 | 40 |
| 2024-07 | 35 |
| 2024-08 | 42 |
| 2024-09 | 53 |
| 2024-10 | 66 |
| 2024-11 | 68 |
| 2024-12 | 117 |

### Eventos de churn por trimestre
| Trimestre | Eventos |
|---|---|
| 2023-T1 | 6 |
| 2023-T2 | 11 |
| 2023-T3 | 19 |
| 2023-T4 | 37 |
| 2024-T1 | 54 |
| 2024-T2 | 92 |
| 2024-T3 | 130 |
| 2024-T4 | 251 |

## 2. Perfil de quem fez churn (base: contas únicas em churn_events; atributos de accounts.csv)

### Por country
| country | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| US | 291 | 206 | 70.8% | 58.5% |
| UK | 58 | 45 | 77.6% | 12.8% |
| IN | 49 | 33 | 67.3% | 9.4% |
| AU | 32 | 22 | 68.8% | 6.2% |
| CA | 23 | 16 | 69.6% | 4.5% |
| FR | 22 | 16 | 72.7% | 4.5% |
| DE | 25 | 14 | 56.0% | 4.0% |

### Por industry
| industry | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| DevTools | 113 | 83 | 73.5% | 23.6% |
| FinTech | 112 | 76 | 67.9% | 21.6% |
| Cybersecurity | 100 | 72 | 72.0% | 20.5% |
| HealthTech | 96 | 64 | 66.7% | 18.2% |
| EdTech | 79 | 57 | 72.2% | 16.2% |

### Por referral_source
| referral_source | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| organic | 114 | 85 | 74.6% | 24.1% |
| other | 103 | 73 | 70.9% | 20.7% |
| event | 96 | 68 | 70.8% | 19.3% |
| partner | 89 | 67 | 75.3% | 19.0% |
| ads | 98 | 59 | 60.2% | 16.8% |

### Por plan_tier (inicial)
| plan_tier (inicial) | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| Pro | 178 | 129 | 72.5% | 36.6% |
| Basic | 168 | 115 | 68.5% | 32.7% |
| Enterprise | 154 | 108 | 70.1% | 30.7% |

### Por is_trial
| is_trial | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| False | 403 | 285 | 70.7% | 81.0% |
| True | 97 | 67 | 69.1% | 19.0% |

### Por seats
| seats | Contas | Com churn | % do grupo que fez churn | Fatia do total de churn |
|---|---|---|---|---|
| 21-50 | 149 | 111 | 74.5% | 31.5% |
| 01-05 | 126 | 87 | 69.0% | 24.7% |
| 11-20 | 116 | 82 | 70.7% | 23.3% |
| 06-10 | 72 | 48 | 66.7% | 13.6% |
| 51+ | 37 | 24 | 64.9% | 6.8% |

Seats — com churn: média 20.7, mediana 15.0 | sem churn: média 20.3, mediana 14.5

### Tempo do signup até o churn_date (por evento)
| Faixa | Eventos | % |
|---|---|---|
| 0-3 meses | 257 | 42.8% |
| 3-6 meses | 113 | 18.8% |
| 6-12 meses | 139 | 23.2% |
| 12+ meses | 91 | 15.2% |
Média 172 dias | mediana 116 dias

## 3. Motivo, reembolso e sinais (churn_events)

### Por reason_code
| Motivo | Eventos | % | Com reembolso | Reembolso total | Reembolso médio (quando há) | Upgrade 90d antes | Downgrade 90d antes | Reativações |
|---|---|---|---|---|---|---|---|---|
| features | 114 | 19.0% | 24 | 1,906 | 79.41 | 17 | 9 | 13 |
| support | 104 | 17.3% | 28 | 1,220 | 43.56 | 28 | 13 | 6 |
| budget | 104 | 17.3% | 24 | 1,248 | 51.98 | 24 | 6 | 12 |
| unknown | 95 | 15.8% | 26 | 1,742 | 67.02 | 19 | 9 | 9 |
| competitor | 92 | 15.3% | 18 | 1,204 | 66.86 | 17 | 12 | 12 |
| pricing | 91 | 15.2% | 22 | 1,333 | 60.60 | 18 | 4 | 9 |
Reembolso: 142 eventos com valor > 0 | total 8,652.25 | média geral 14.42
preceding_upgrade: 123 | preceding_downgrade: 53 | is_reactivation: 61

### feedback_text
| Texto | Eventos |
|---|---|
| too expensive | 161 |
| missing features | 155 |
| (vazio) | 148 |
| switched to competitor | 136 |

### Motivo x país (eventos)
| Motivo | US | UK | IN | AU | CA | DE | FR |
|---|---|---|---|---|---|---|---|
| budget | 56 | 19 | 5 | 6 | 6 | 5 | 7 |
| competitor | 55 | 10 | 8 | 4 | 9 | 3 | 3 |
| features | 68 | 10 | 12 | 7 | 7 | 5 | 5 |
| pricing | 49 | 12 | 13 | 5 | 1 | 6 | 5 |
| support | 64 | 15 | 4 | 5 | 3 | 7 | 6 |
| unknown | 58 | 11 | 10 | 7 | 5 | 3 | 1 |

## 4. Quanto gastaram (subscriptions: mrr_amount x dias ativos / 30,44)
Leitura A = soma todas as assinaturas ativas no dia. Leitura B = só a assinatura ativa iniciada mais recentemente no dia.
- Com churn (até o último churn_date): 352 contas | A total 17,610,037, média 50,029, mediana 22,412 | B total 4,259,105, média 12,100, mediana 6,172
- Sem churn (até 31/12/2024): 148 contas | A total 16,136,329, média 109,029, mediana 76,483 | B total 3,202,639, média 21,639, mediana 15,493
- Contas com churn: receita gerada DEPOIS do último churn_date — A 23,506,557, B 3,886,267
- MRR ativo na data do churn (soma dos 600 eventos): A 6,127,526 | B 1,205,220 | eventos com MRR zero no dia (B): 138

### Gasto até o churn por country (contas com churn)
| country | Contas | Total A | Média A | Total B | Média B | Fatia do gasto A |
|---|---|---|---|---|---|---|
| US | 206 | 10,657,175 | 51,734 | 2,443,753 | 11,863 | 60.5% |
| IN | 33 | 2,497,704 | 75,688 | 547,479 | 16,590 | 14.2% |
| UK | 45 | 1,609,313 | 35,763 | 487,657 | 10,837 | 9.1% |
| CA | 16 | 868,886 | 54,305 | 215,129 | 13,446 | 4.9% |
| AU | 22 | 775,842 | 35,266 | 176,421 | 8,019 | 4.4% |
| DE | 14 | 759,629 | 54,259 | 281,408 | 20,101 | 4.3% |
| FR | 16 | 441,487 | 27,593 | 107,257 | 6,704 | 2.5% |

### Gasto até o churn por industry (contas com churn)
| industry | Contas | Total A | Média A | Total B | Média B | Fatia do gasto A |
|---|---|---|---|---|---|---|
| FinTech | 76 | 4,645,668 | 61,127 | 1,182,215 | 15,555 | 26.4% |
| DevTools | 83 | 4,643,100 | 55,941 | 1,052,621 | 12,682 | 26.4% |
| HealthTech | 64 | 4,235,692 | 66,183 | 856,751 | 13,387 | 24.1% |
| Cybersecurity | 72 | 2,211,918 | 30,721 | 660,703 | 9,176 | 12.6% |
| EdTech | 57 | 1,873,659 | 32,871 | 506,815 | 8,891 | 10.6% |

### Gasto até o churn por referral_source (contas com churn)
| referral_source | Contas | Total A | Média A | Total B | Média B | Fatia do gasto A |
|---|---|---|---|---|---|---|
| organic | 85 | 4,437,760 | 52,209 | 979,830 | 11,527 | 25.2% |
| ads | 59 | 3,955,647 | 67,045 | 933,403 | 15,820 | 22.5% |
| partner | 67 | 3,367,413 | 50,260 | 875,875 | 13,073 | 19.1% |
| other | 73 | 3,092,871 | 42,368 | 806,182 | 11,044 | 17.6% |
| event | 68 | 2,756,345 | 40,534 | 663,814 | 9,762 | 15.7% |

### Gasto até o churn por plan_tier (inicial) (contas com churn)
| plan_tier (inicial) | Contas | Total A | Média A | Total B | Média B | Fatia do gasto A |
|---|---|---|---|---|---|---|
| Pro | 129 | 6,836,090 | 52,993 | 1,763,642 | 13,672 | 38.8% |
| Enterprise | 108 | 5,583,167 | 51,696 | 1,292,867 | 11,971 | 31.7% |
| Basic | 115 | 5,190,780 | 45,137 | 1,202,595 | 10,457 | 29.5% |

### Gasto até o churn por motivo (conta contada em cada motivo que teve)
| Motivo | Contas | Média A | Média B |
|---|---|---|---|
| budget | 94 | 50,266 | 11,614 |
| competitor | 79 | 66,079 | 15,361 |
| features | 104 | 63,697 | 14,340 |
| pricing | 86 | 46,886 | 12,114 |
| support | 95 | 53,671 | 14,282 |
| unknown | 86 | 47,610 | 11,587 |

### billing_frequency da última assinatura iniciada até o churn_date (com churn, por evento) vs até 31/12/2024 (sem churn)
| billing_frequency | Com churn | % | Sem churn | % |
|---|---|---|---|---|
| annual | 271 | 49.5% | 82 | 55.4% |
| monthly | 276 | 50.5% | 66 | 44.6% |

### auto_renew_flag da última assinatura iniciada até o churn_date (com churn, por evento) vs até 31/12/2024 (sem churn)
| auto_renew_flag | Com churn | % | Sem churn | % |
|---|---|---|---|---|
| False | 88 | 16.1% | 26 | 17.6% |
| True | 459 | 83.9% | 122 | 82.4% |

### plan_tier da última assinatura iniciada até o churn_date (com churn, por evento) vs até 31/12/2024 (sem churn)
| plan_tier | Com churn | % | Sem churn | % |
|---|---|---|---|---|
| Basic | 167 | 30.5% | 36 | 24.3% |
| Enterprise | 198 | 36.2% | 63 | 42.6% |
| Pro | 182 | 33.3% | 49 | 33.1% |

## 5. Suporte nos 90 dias antes (com churn: antes do último churn_date | sem churn: antes de 31/12/2024)

### Tickets — janela de 90 dias
| Grupo | Tickets | Tickets/conta | % contas com ticket | % high+urgent | Resolução média (h) | 1ª resposta média (min) | Satisfação média | % sem nota | % escalados |
|---|---|---|---|---|---|---|---|---|---|
| Com churn | 187 | 0.53 | 42.3% | 51.9% | 35.7 | 89 | 4.03 | 40.1% | 5.9% |
| Sem churn | 77 | 0.52 | 40.5% | 54.5% | 34.6 | 83 | 3.94 | 35.1% | 5.2% |

### Tickets — histórico inteiro
| Grupo | Tickets | Tickets/conta | % contas com ticket | % high+urgent | Resolução média (h) | 1ª resposta média (min) | Satisfação média | % sem nota | % escalados |
|---|---|---|---|---|---|---|---|---|---|
| Com churn | 1395 | 3.96 | 98.6% | 51.0% | 35.7 | 89 | 3.98 | 41.6% | 5.1% |
| Sem churn | 605 | 4.09 | 98.0% | 51.6% | 36.1 | 88 | 3.98 | 40.5% | 4.0% |

### Tickets nos 90 dias antes do último churn, por motivo
| Grupo | Tickets | Tickets/conta | % contas com ticket | % high+urgent | Resolução média (h) | 1ª resposta média (min) | Satisfação média | % sem nota | % escalados |
|---|---|---|---|---|---|---|---|---|---|
| budget | 52 | 0.55 | 47.9% | 48.1% | 38.8 | 88 | 3.83 | 42.3% | 5.8% |
| competitor | 35 | 0.44 | 34.2% | 48.6% | 35.4 | 100 | 4.00 | 51.4% | 5.7% |
| features | 49 | 0.47 | 38.5% | 46.9% | 35.3 | 91 | 3.48 | 57.1% | 6.1% |
| pricing | 47 | 0.55 | 41.9% | 44.7% | 35.1 | 83 | 4.21 | 29.8% | 8.5% |
| support | 52 | 0.55 | 43.2% | 57.7% | 32.7 | 83 | 4.32 | 40.4% | 3.8% |
| unknown | 50 | 0.58 | 47.7% | 38.0% | 37.7 | 97 | 4.21 | 34.0% | 8.0% |

## 6. Uso do produto nos 90 dias antes (mesma janela)

### Uso — janela de 90 dias
| Grupo | Registros | Registros/conta | usage_count/conta | Horas de uso/conta | Erros/conta | Erros por uso | % em beta | Features distintas |
|---|---|---|---|---|---|---|---|---|
| Com churn | 2262 | 6.4 | 64.1 | 5.4 | 3.61 | 5.64% | 9.1% | 40 |
| Sem churn | 954 | 6.4 | 64.7 | 5.5 | 3.18 | 4.91% | 11.1% | 40 |

### Uso — histórico inteiro
| Grupo | Registros | Registros/conta | usage_count/conta | Horas de uso/conta | Erros/conta | Erros por uso | % em beta | Features distintas |
|---|---|---|---|---|---|---|---|---|
| Com churn | 17690 | 50.3 | 503.4 | 42.5 | 28.39 | 5.64% | 10.0% | 40 |
| Sem churn | 7310 | 49.4 | 495.4 | 41.6 | 27.79 | 5.61% | 10.5% | 40 |

### Uso nos 90 dias antes do último churn, por motivo
| Grupo | Registros | Registros/conta | usage_count/conta | Horas de uso/conta | Erros/conta | Erros por uso | % em beta | Features distintas |
|---|---|---|---|---|---|---|---|---|
| budget | 604 | 6.4 | 63.0 | 5.2 | 3.98 | 6.32% | 9.9% | 40 |
| competitor | 524 | 6.6 | 66.8 | 5.5 | 3.80 | 5.68% | 9.4% | 40 |
| features | 704 | 6.8 | 67.2 | 5.5 | 3.88 | 5.77% | 8.1% | 40 |
| pricing | 532 | 6.2 | 61.5 | 5.2 | 3.70 | 6.01% | 7.7% | 40 |
| support | 581 | 6.1 | 62.4 | 5.3 | 3.07 | 4.93% | 9.5% | 40 |
| unknown | 509 | 5.9 | 59.1 | 5.1 | 3.45 | 5.84% | 10.0% | 40 |

### Features: maior diferença de participação no uso (90 dias) — com churn menos sem churn
| Feature | % no uso com churn | % no uso sem churn | Diferença (p.p.) |
|---|---|---|---|
| feature_2 | 2.3% | 3.2% | -0.99 |
| feature_20 | 2.3% | 3.2% | -0.99 |
| feature_18 | 1.8% | 2.4% | -0.60 |
| feature_29 | 2.3% | 2.8% | -0.53 |
| feature_23 | 1.7% | 2.2% | -0.52 |
| feature_24 | 3.1% | 2.3% | +0.79 |
| feature_37 | 2.1% | 1.3% | +0.86 |
| feature_5 | 2.3% | 1.4% | +0.89 |
| feature_12 | 3.2% | 2.3% | +0.92 |
| feature_34 | 3.6% | 2.3% | +1.27 |
