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
A = {a['account_id']: a for a in acc}
S = {s['subscription_id']: s for s in sub}
def q(d): return f"{d.year}-T{(d.month-1)//3+1}"
def qstart(k): y, t = k.split('-T'); return dt.date(int(y), 3*(int(t)-1)+1, 1)
Q = sorted({q(D(s['start_date'])) for s in sub})
def mean(l): return st.mean(l) if l else 0

print("== definicoes de churn")
print("subs churn_flag True:", sum(T(s['churn_flag']) for s in sub), "| com end_date:", sum(1 for s in sub if s['end_date']),
      "| churn True sem end:", sum(1 for s in sub if T(s['churn_flag']) and not s['end_date']), "| end sem churn:", sum(1 for s in sub if s['end_date'] and not T(s['churn_flag'])))
sb = defaultdict(list)
for s in sub: sb[s['account_id']].append(s)
lost_latest = {a for a, l in sb.items() if T(max(l, key=lambda s: s['start_date'])['churn_flag'])}
no_active = {a for a, l in sb.items() if not any(not s['end_date'] or D(s['end_date']) >= END for s in l)}
any_sub_churn = {a for a, l in sb.items() if any(T(s['churn_flag']) for s in l)}
ev = {e['account_id'] for e in ce}
flag = {a for a in A if T(A[a]['churn_flag'])}
for n, st_ in [('accounts.churn_flag', flag), ('churn_events', ev), ('subs: alguma churn_flag', any_sub_churn), ('subs: ultima assinatura churn', lost_latest), ('subs: nenhuma assinatura ativa em 31/12/24', no_active)]:
    print(f"  {n}: {len(st_)} | inter events {len(st_ & ev)} | inter flag {len(st_ & flag)} | inter no_active {len(st_ & no_active)}")

print("\n== trimestre: base, entradas, churn")
print("tri | contas c/ assinatura paga ativa no inicio | MRR inicio | signups | eventos churn | subs pagas encerradas (churn) | MRR encerrado | % MRR perdido | contas que zeraram")
for k in Q:
    s0 = qstart(k); e0 = (dt.date(s0.year + (s0.month == 10), (s0.month + 3 - 1) % 12 + 1, 1)) - dt.timedelta(days=1)
    act = [s for s in sub if D(s['start_date']) <= s0 and (not s['end_date'] or D(s['end_date']) >= s0) and float(s['mrr_amount']) > 0]
    mrr0 = sum(float(s['mrr_amount']) for s in act)
    ended = [s for s in sub if T(s['churn_flag']) and s['end_date'] and s0 <= D(s['end_date']) <= e0 and float(s['mrr_amount']) > 0]
    mlost = sum(float(s['mrr_amount']) for s in ended)
    zer = sum(1 for a, l in sb.items() if any(s0 <= D(s['end_date']) <= e0 for s in l if s['end_date']) and not any(D(s['start_date']) <= e0 and (not s['end_date'] or D(s['end_date']) > e0) for s in l) and any(D(s['start_date']) < s0 for s in l))
    print(f"{k} | {len({s['account_id'] for s in act})} | {mrr0:,.0f} | {sum(1 for a in acc if q(D(a['signup_date'])) == k)} | {sum(1 for e in ce if q(D(e['churn_date'])) == k)} | {len(ended)} | {mlost:,.0f} | {(100*mlost/mrr0 if mrr0 else 0):.1f}% | {zer}")

print("\n== dez/2024 efeito borda: eventos por dia dez/24 top")
print(Counter(e['churn_date'] for e in ce if e['churn_date'].startswith('2024-12')).most_common(5))
print("subs end_date em 2024-12-31:", sum(1 for s in sub if s['end_date'] == '2024-12-31'), "| end_date em dez/24:", sum(1 for s in sub if s['end_date'][:7] == '2024-12'))
print("eventos por mes 2024 / signups por mes 2024:")
for m in range(1, 13):
    k = f"2024-{m:02d}"
    print(" ", k, sum(1 for e in ce if e['churn_date'][:7] == k), sum(1 for a in acc if a['signup_date'][:7] == k), sum(1 for s in sub if s['start_date'][:7] == k))

print("\n== uso por trimestre (CEO: uso cresceu)")
s_seg = {}
for s in sub: s_seg[s['subscription_id']] = s
uq = defaultdict(lambda: [0, 0, 0, 0, set()])
for u in fu:
    k = q(D(u['usage_date'])); r = uq[k]
    r[0] += int(u['usage_count']); r[1] += int(u['error_count']); r[2] += 1; r[3] += int(u['usage_duration_secs']); r[4].add(S[u['subscription_id']]['account_id'])
print("tri | registros | usage_count | contas usando | uso/conta | erros/uso % | horas")
for k in sorted(uq):
    r = uq[k]; print(f"{k} | {r[2]} | {r[0]} | {len(r[4])} | {r[0]/len(r[4]):.1f} | {100*r[1]/r[0]:.2f}% | {r[3]/3600:.0f}")
def seg_growth(name, fn):
    g = defaultdict(lambda: defaultdict(lambda: [0, set()]))
    for u in fu:
        s = S[u['subscription_id']]; k = q(D(u['usage_date'])); seg = fn(s, A[s['account_id']])
        g[seg][k][0] += int(u['usage_count']); g[seg][k][1].add(s['account_id'])
    print(f"\n-- uso por {name}: usage_count 2023 vs 2024 | T3-24 vs T4-24 | uso/conta T3-24 -> T4-24")
    for seg, d in sorted(g.items()):
        y23 = sum(v[0] for k, v in d.items() if k.startswith('2023')); y24 = sum(v[0] for k, v in d.items() if k.startswith('2024'))
        t3, t4 = d['2024-T3'], d['2024-T4']
        print(f"  {seg}: {y23} -> {y24} ({(100*(y24-y23)/y23 if y23 else 0):+.0f}%) | {t3[0]} -> {t4[0]} ({(100*(t4[0]-t3[0])/t3[0] if t3[0] else 0):+.0f}%) | {t3[0]/max(len(t3[1]),1):.1f} -> {t4[0]/max(len(t4[1]),1):.1f}")
seg_growth('plan_tier da assinatura', lambda s, a: s['plan_tier'])
seg_growth('industry', lambda s, a: a['industry'])
seg_growth('country', lambda s, a: a['country'])
seg_growth('referral_source', lambda s, a: a['referral_source'])
seg_growth('is_trial da assinatura', lambda s, a: s['is_trial'])
seg_growth('billing_frequency', lambda s, a: s['billing_frequency'])
seg_growth('status final da conta (ultima assinatura churn?)', lambda s, a: 'perdida' if s['account_id'] in lost_latest else 'ativa')
seg_growth('conta em churn_events', lambda s, a: 'com evento' if s['account_id'] in ev else 'sem evento')

print("\n== suporte por trimestre (CS: satisfacao ok)")
tq = defaultdict(list)
for t in tk: tq[q(D(t['submitted_at']))].append(t)
print("tri | tickets | satisf media | % sem nota | resol h | 1a resp min | % escalado | % urgent+high")
for k in sorted(tq):
    l = tq[k]; sat = [F(t['satisfaction_score']) for t in l if F(t['satisfaction_score']) is not None]
    print(f"{k} | {len(l)} | {mean(sat):.2f} | {100*(len(l)-len(sat))/len(l):.0f}% | {mean([F(t['resolution_time_hours']) for t in l]):.1f} | {mean([F(t['first_response_time_minutes']) for t in l]):.0f} | {100*sum(T(t['escalation_flag']) for t in l)/len(l):.1f}% | {100*sum(t['priority'] in ('urgent','high') for t in l)/len(l):.0f}%")
sat_by = Counter(t['satisfaction_score'] or 'vazio' for t in tk); print("distribuicao notas:", sorted(sat_by.items()))

print("\n== nivel assinatura: taxa de churn por atributo (so pagas, mrr>0)")
paid = [s for s in sub if float(s['mrr_amount']) > 0]
for col in ['plan_tier', 'billing_frequency', 'auto_renew_flag', 'upgrade_flag', 'downgrade_flag', 'is_trial']:
    base = sub if col == 'is_trial' else paid
    c = defaultdict(lambda: [0, 0, 0.0, 0.0])
    for s in base:
        r = c[s[col]]; r[0] += 1; m = float(s['mrr_amount']); r[2] += m
        if T(s['churn_flag']): r[1] += 1; r[3] += m
    print(f"  {col}: " + " | ".join(f"{k}: {v[1]}/{v[0]} = {100*v[1]/v[0]:.1f}% subs, {100*v[3]/v[2] if v[2] else 0:.1f}% MRR" for k, v in sorted(c.items())))

print("\n== peso do churn: MRR das assinaturas encerradas (churn_flag)")
ch = sorted([float(s['mrr_amount']) for s in paid if T(s['churn_flag'])], reverse=True)
tot = sum(ch)
for lo, hi in [(0, 100), (100, 500), (500, 1000), (1000, 5000), (5000, 1e12)]:
    l = [m for m in ch if lo < m <= hi] if lo else [m for m in ch if m <= hi]
    print(f"  MRR {lo}-{hi}: {len(l)} subs ({100*len(l)/len(ch):.1f}%) | {sum(l):,.0f} ({100*sum(l)/tot:.1f}% do MRR perdido)")
k10 = int(len(ch)*0.1); print(f"  top 10% das subs encerradas = {100*sum(ch[:k10])/tot:.1f}% do MRR perdido | total perdido {tot:,.0f} em {len(ch)} subs")

print("\n== nivel assinatura: uso e suporte, encerrada vs ativa (pagas)")
fu_s = defaultdict(list)
for u in fu: fu_s[u['subscription_id']].append(u)
def life_m(s): return max(((D(s['end_date']) if s['end_date'] else END) - D(s['start_date'])).days, 1) / 30.44
for lbl, grp in [('encerrada', [s for s in paid if T(s['churn_flag'])]), ('ativa', [s for s in paid if not T(s['churn_flag'])])]:
    us = [(sum(int(u['usage_count']) for u in fu_s[s['subscription_id']]), sum(int(u['error_count']) for u in fu_s[s['subscription_id']]), life_m(s), len(fu_s[s['subscription_id']])) for s in grp]
    cnt = sum(x[0] for x in us); er = sum(x[1] for x in us)
    print(f"  {lbl}: {len(grp)} subs | vida media {mean([x[2] for x in us]):.1f} m | uso por mes de vida {cnt/sum(x[2] for x in us):.1f} | erros/uso {100*er/cnt:.2f}% | % subs sem nenhum uso {100*sum(1 for x in us if x[3]==0)/len(us):.1f}%")

print("\n== evento de churn -> assinatura encerrada mais proxima (<=30 dias)")
hit = 0; gap = []
for e in ce:
    cd = D(e['churn_date']); c = [s for s in sb[e['account_id']] if s['end_date']]
    if c:
        b = min(c, key=lambda s: abs((D(s['end_date']) - cd).days)); g = abs((D(b['end_date']) - cd).days); gap.append(g)
        if g <= 30: hit += 1
print(f"  eventos com assinatura encerrada ate 30 dias: {hit}/600 | mediana distancia {st.median(gap) if gap else '-'} dias")
print("\n== reason_code x feedback_text")
cx = defaultdict(Counter)
for e in ce: cx[e['reason_code']][e['feedback_text'] or 'vazio'] += 1
for r, c in sorted(cx.items()): print(" ", r, dict(c))
