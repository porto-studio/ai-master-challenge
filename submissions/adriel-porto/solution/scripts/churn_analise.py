import csv, datetime as dt, statistics as st
from collections import defaultdict, Counter

import os
# caminho relativo a este script: solution/scripts/ -> solution/dashboards/data/
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data', 'ravenstack_')
L = lambda n: list(csv.DictReader(open(P + n + '.csv')))
acc, ce, fu, sub, tk = L('accounts'), L('churn_events'), L('feature_usage'), L('subscriptions'), L('support_tickets')
D = lambda s: dt.date.fromisoformat(s[:10]) if s else None
T = lambda s: s == 'True'
F = lambda s: float(s) if s not in ('', None) else None
END = dt.date(2024, 12, 31)
ONE = dt.timedelta(days=1)
M = 30.44

def pct(a, b): return f"{(100*a/b):.1f}%" if b else "-"
def money(x): return f"{x:,.0f}"
def mean(l): return st.mean(l) if l else 0
def med(l): return st.median(l) if l else 0
def table(title, head, rows):
    print(f"\n### {title}")
    print("| " + " | ".join(head) + " |")
    print("|" + "---|" * len(head))
    for r in rows: print("| " + " | ".join(str(x) for x in r) + " |")

A = {a['account_id']: a for a in acc}
ev_by = defaultdict(list)
for e in ce: ev_by[e['account_id']].append(e)
churned = set(ev_by)
active = set(A) - churned
last_churn = {a: max(D(e['churn_date']) for e in l) for a, l in ev_by.items()}

print("## 0. Checagens")
for name, rows, col in [('accounts', acc, 'signup_date'), ('subscriptions', sub, 'start_date'), ('churn_events', ce, 'churn_date'), ('support_tickets', tk, 'submitted_at'), ('feature_usage', fu, 'usage_date')]:
    ds = [D(r[col]) for r in rows if r[col]]
    print(f"- {name}: {len(rows)} linhas, {col} de {min(ds)} a {max(ds)}")
flag = {a for a in A if T(A[a]['churn_flag'])}
print(f"- eventos de churn: {len(ce)} | contas únicas com churn: {len(churned)} de {len(A)} ({pct(len(churned), len(A))})")
print(f"- contas com mais de 1 evento: {sum(1 for l in ev_by.values() if len(l) > 1)} | máx eventos numa conta: {max(len(l) for l in ev_by.values())}")
print(f"- accounts.churn_flag=True: {len(flag)} | em churn_events e flag True: {len(churned & flag)} | em churn_events e flag False: {len(churned - flag)} | flag True sem evento: {len(flag - churned)}")
print(f"- churn_date antes do signup_date: {sum(1 for e in ce if D(e['churn_date']) < D(A[e['account_id']]['signup_date']))}")
subs_by = defaultdict(list)
for s in sub: subs_by[s['account_id']].append(s)
match = sum(1 for e in ce if any(s['end_date'] == e['churn_date'] for s in subs_by[e['account_id']]))
print(f"- eventos cujo churn_date bate com algum end_date de assinatura da conta: {match} de {len(ce)}")
after = sum(1 for a in churned if any(D(s['start_date']) > last_churn[a] for s in subs_by[a]))
print(f"- contas com churn que têm assinatura iniciada depois do último churn_date: {after}")

print("\n## 1. Linha do tempo (por churn_date)")
bym = Counter(e['churn_date'][:7] for e in ce)
table("Eventos de churn por mês", ["Mês", "Eventos"], sorted(bym.items()))
byq = Counter(f"{e['churn_date'][:4]}-T{(int(e['churn_date'][5:7])-1)//3+1}" for e in ce)
table("Eventos de churn por trimestre", ["Trimestre", "Eventos"], sorted(byq.items()))

print("\n## 2. Perfil de quem fez churn (base: contas únicas em churn_events; atributos de accounts.csv)")
def seat_b(n):
    n = int(n)
    return "01-05" if n <= 5 else "06-10" if n <= 10 else "11-20" if n <= 20 else "21-50" if n <= 50 else "51+"
dims = [('country', lambda a: a['country']), ('industry', lambda a: a['industry']), ('referral_source', lambda a: a['referral_source']),
        ('plan_tier (inicial)', lambda a: a['plan_tier']), ('is_trial', lambda a: a['is_trial']), ('seats', lambda a: seat_b(a['seats']))]
for name, fn in dims:
    tot, ch = Counter(), Counter()
    for a in A.values():
        k = fn(a); tot[k] += 1
        if a['account_id'] in churned: ch[k] += 1
    rows = sorted(tot, key=lambda k: -ch[k])
    table(f"Por {name}", [name, "Contas", "Com churn", "% do grupo que fez churn", "Fatia do total de churn"],
          [[k, tot[k], ch[k], pct(ch[k], tot[k]), pct(ch[k], len(churned))] for k in rows])
seats_c = [int(A[a]['seats']) for a in churned]; seats_n = [int(A[a]['seats']) for a in active]
print(f"\nSeats — com churn: média {mean(seats_c):.1f}, mediana {med(seats_c)} | sem churn: média {mean(seats_n):.1f}, mediana {med(seats_n)}")
ten = [(D(e['churn_date']) - D(A[e['account_id']]['signup_date'])).days for e in ce]
tb = Counter("0-3 meses" if d < 91 else "3-6 meses" if d < 182 else "6-12 meses" if d < 365 else "12+ meses" for d in ten)
table("Tempo do signup até o churn_date (por evento)", ["Faixa", "Eventos", "%"], [[k, tb[k], pct(tb[k], len(ce))] for k in ["0-3 meses", "3-6 meses", "6-12 meses", "12+ meses"]])
print(f"Média {mean(ten):.0f} dias | mediana {med(ten):.0f} dias")

print("\n## 3. Motivo, reembolso e sinais (churn_events)")
rc = defaultdict(list)
for e in ce: rc[e['reason_code']].append(e)
table("Por reason_code", ["Motivo", "Eventos", "%", "Com reembolso", "Reembolso total", "Reembolso médio (quando há)", "Upgrade 90d antes", "Downgrade 90d antes", "Reativações"],
      [[k, len(l), pct(len(l), len(ce)), sum(1 for e in l if F(e['refund_amount_usd']) and F(e['refund_amount_usd']) > 0),
        money(sum(F(e['refund_amount_usd']) or 0 for e in l)),
        f"{mean([F(e['refund_amount_usd']) for e in l if F(e['refund_amount_usd'])]):.2f}",
        sum(T(e['preceding_upgrade_flag']) for e in l), sum(T(e['preceding_downgrade_flag']) for e in l), sum(T(e['is_reactivation']) for e in l)]
       for k, l in sorted(rc.items(), key=lambda x: -len(x[1]))])
ref = [F(e['refund_amount_usd']) or 0 for e in ce]
print(f"Reembolso: {sum(1 for r in ref if r > 0)} eventos com valor > 0 | total {sum(ref):,.2f} | média geral {mean(ref):.2f}")
print(f"preceding_upgrade: {sum(T(e['preceding_upgrade_flag']) for e in ce)} | preceding_downgrade: {sum(T(e['preceding_downgrade_flag']) for e in ce)} | is_reactivation: {sum(T(e['is_reactivation']) for e in ce)}")
fb = Counter(e['feedback_text'] for e in ce)
table("feedback_text", ["Texto", "Eventos"], [[k or "(vazio)", v] for k, v in fb.most_common()])
cross = defaultdict(Counter)
for e in ce: cross[e['reason_code']][A[e['account_id']]['country']] += 1
countries = [c for c, _ in Counter(A[e['account_id']]['country'] for e in ce).most_common()]
table("Motivo x país (eventos)", ["Motivo"] + countries, [[r] + [cross[r][c] for c in countries] for r in sorted(cross)])

print("\n## 4. Quanto gastaram (subscriptions: mrr_amount x dias ativos / 30,44)")
print("Leitura A = soma todas as assinaturas ativas no dia. Leitura B = só a assinatura ativa iniciada mais recentemente no dia.")
spend = {}
mrr_at = {}
for a, ss in subs_by.items():
    rows = [(D(s['start_date']), (D(s['end_date']) if s['end_date'] else END + ONE), float(s['mrr_amount']), i) for i, s in enumerate(ss)]
    cut = last_churn.get(a, END)
    bA = bB = aA = aB = 0.0
    d = min(r[0] for r in rows)
    while d <= END:
        act = [r for r in rows if r[0] <= d < r[1]]
        if act:
            va = sum(r[2] for r in act) / M
            vb = max(act, key=lambda r: (r[0], r[3]))[2] / M
            if d <= cut: bA += va; bB += vb
            else: aA += va; aB += vb
        d += ONE
    spend[a] = (bA, bB, aA, aB)
def mrr_on(a, day):
    act = [(D(s['start_date']), i, float(s['mrr_amount'])) for i, s in enumerate(subs_by[a])
           if D(s['start_date']) <= day and (not s['end_date'] or day <= D(s['end_date']))]
    return sum(x[2] for x in act), (max(act)[2] if act else 0)
for grp, ids, lbl in [("Com churn (até o último churn_date)", churned, 0), ("Sem churn (até 31/12/2024)", active, 0)]:
    la = [spend[a][0] for a in ids]; lb = [spend[a][1] for a in ids]
    print(f"- {grp}: {len(ids)} contas | A total {money(sum(la))}, média {money(mean(la))}, mediana {money(med(la))} | B total {money(sum(lb))}, média {money(mean(lb))}, mediana {money(med(lb))}")
print(f"- Contas com churn: receita gerada DEPOIS do último churn_date — A {money(sum(spend[a][2] for a in churned))}, B {money(sum(spend[a][3] for a in churned))}")
ma = [mrr_on(e['account_id'], D(e['churn_date'])) for e in ce]
print(f"- MRR ativo na data do churn (soma dos {len(ce)} eventos): A {money(sum(x[0] for x in ma))} | B {money(sum(x[1] for x in ma))} | eventos com MRR zero no dia (B): {sum(1 for x in ma if x[1] == 0)}")
for name, fn in dims[:4]:
    g = defaultdict(list)
    for a in churned: g[fn(A[a])].append(a)
    table(f"Gasto até o churn por {name} (contas com churn)", [name, "Contas", "Total A", "Média A", "Total B", "Média B", "Fatia do gasto A"],
          [[k, len(l), money(sum(spend[a][0] for a in l)), money(mean([spend[a][0] for a in l])), money(sum(spend[a][1] for a in l)), money(mean([spend[a][1] for a in l])),
            pct(sum(spend[a][0] for a in l), sum(spend[a][0] for a in churned))]
           for k, l in sorted(g.items(), key=lambda x: -sum(spend[a][0] for a in x[1]))])
g = defaultdict(list)
for e in ce: g[e['reason_code']].append(e['account_id'])
table("Gasto até o churn por motivo (conta contada em cada motivo que teve)", ["Motivo", "Contas", "Média A", "Média B"],
      [[k, len(set(l)), money(mean([spend[a][0] for a in set(l)])), money(mean([spend[a][1] for a in set(l)]))] for k, l in sorted(g.items())])

def latest_sub(a, day):
    c = [s for s in subs_by[a] if D(s['start_date']) <= day]
    return max(c, key=lambda s: s['start_date']) if c else None
for col in ['billing_frequency', 'auto_renew_flag', 'plan_tier']:
    cc = Counter(); cn = Counter()
    for e in ce:
        s = latest_sub(e['account_id'], D(e['churn_date']))
        if s: cc[s[col]] += 1
    for a in active:
        s = latest_sub(a, END)
        if s: cn[s[col]] += 1
    keys = sorted(set(cc) | set(cn))
    table(f"{col} da última assinatura iniciada até o churn_date (com churn, por evento) vs até 31/12/2024 (sem churn)", [col, "Com churn", "%", "Sem churn", "%"],
          [[k, cc[k], pct(cc[k], sum(cc.values())), cn[k], pct(cn[k], sum(cn.values()))] for k in keys])

print("\n## 5. Suporte nos 90 dias antes (com churn: antes do último churn_date | sem churn: antes de 31/12/2024)")
def window(a): end = last_churn.get(a, END); return end - dt.timedelta(days=90), end
tk_by = defaultdict(list)
for t in tk: tk_by[t['account_id']].append(t)
def tstats(ids, win):
    ts = []
    for a in ids:
        s, e = window(a) if win else (dt.date.min, dt.date.max)
        ts += [t for t in tk_by[a] if s <= D(t['submitted_at']) <= e]
    sat = [F(t['satisfaction_score']) for t in ts if F(t['satisfaction_score']) is not None]
    pr = Counter(t['priority'] for t in ts)
    return [len(ts), f"{len(ts)/len(ids):.2f}", pct(sum(1 for a in ids if any((window(a)[0] if win else dt.date.min) <= D(t['submitted_at']) <= (window(a)[1] if win else dt.date.max) for t in tk_by[a])), len(ids)),
            pct(pr['urgent'] + pr['high'], len(ts)), f"{mean([F(t['resolution_time_hours']) for t in ts if F(t['resolution_time_hours']) is not None]):.1f}",
            f"{mean([F(t['first_response_time_minutes']) for t in ts if F(t['first_response_time_minutes']) is not None]):.0f}",
            f"{mean(sat):.2f}", pct(len(ts) - len(sat), len(ts)), pct(sum(T(t['escalation_flag']) for t in ts), len(ts))]
H = ["Grupo", "Tickets", "Tickets/conta", "% contas com ticket", "% high+urgent", "Resolução média (h)", "1ª resposta média (min)", "Satisfação média", "% sem nota", "% escalados"]
table("Tickets — janela de 90 dias", H, [["Com churn"] + tstats(churned, True), ["Sem churn"] + tstats(active, True)])
table("Tickets — histórico inteiro", H, [["Com churn"] + tstats(churned, False), ["Sem churn"] + tstats(active, False)])
g = defaultdict(set)
for e in ce: g[e['reason_code']].add(e['account_id'])
table("Tickets nos 90 dias antes do último churn, por motivo", H, [[k] + tstats(v, True) for k, v in sorted(g.items())])

print("\n## 6. Uso do produto nos 90 dias antes (mesma janela)")
s2a = {s['subscription_id']: s['account_id'] for s in sub}
fu_by = defaultdict(list)
for u in fu: fu_by[s2a[u['subscription_id']]].append(u)
def ustats(ids, win=True):
    us = []
    for a in ids:
        s, e = window(a) if win else (dt.date.min, dt.date.max)
        us += [u for u in fu_by[a] if s <= D(u['usage_date']) <= e]
    cnt = sum(int(u['usage_count']) for u in us); err = sum(int(u['error_count']) for u in us)
    return us, [len(us), f"{len(us)/len(ids):.1f}", f"{cnt/len(ids):.1f}", f"{sum(int(u['usage_duration_secs']) for u in us)/3600/len(ids):.1f}",
                f"{err/len(ids):.2f}", f"{(err/cnt*100 if cnt else 0):.2f}%", pct(sum(T(u['is_beta_feature']) for u in us), len(us)), len({u['feature_name'] for u in us})]
HU = ["Grupo", "Registros", "Registros/conta", "usage_count/conta", "Horas de uso/conta", "Erros/conta", "Erros por uso", "% em beta", "Features distintas"]
uc, rc_ = ustats(churned); un, rn_ = ustats(active)
table("Uso — janela de 90 dias", HU, [["Com churn"] + rc_, ["Sem churn"] + rn_])
table("Uso — histórico inteiro", HU, [["Com churn"] + ustats(churned, False)[1], ["Sem churn"] + ustats(active, False)[1]])
table("Uso nos 90 dias antes do último churn, por motivo", HU, [[k] + ustats(v)[1] for k, v in sorted(g.items())])
fc = Counter(u['feature_name'] for u in uc); fn_ = Counter(u['feature_name'] for u in un)
diff = sorted(set(fc) | set(fn_), key=lambda f: (fc[f]/len(uc)) - (fn_[f]/len(un)))
table("Features: maior diferença de participação no uso (90 dias) — com churn menos sem churn", ["Feature", "% no uso com churn", "% no uso sem churn", "Diferença (p.p.)"],
      [[f, pct(fc[f], len(uc)), pct(fn_[f], len(un)), f"{100*(fc[f]/len(uc) - fn_[f]/len(un)):+.2f}"] for f in diff[:5] + diff[-5:]])
