import csv, datetime as dt, math, os
import numpy as np
from collections import defaultdict, Counter

import os
# caminho relativo a este script: solution/scripts/ -> solution/dashboards/data/
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data', 'ravenstack_')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TAB = OUT + '/tabelas'
os.makedirs(TAB, exist_ok=True)
L = lambda n: list(csv.DictReader(open(P + n + '.csv', encoding='utf-8')))
acc, ce, fu, sub, tk = L('accounts'), L('churn_events'), L('feature_usage'), L('subscriptions'), L('support_tickets')
D = lambda s: dt.date.fromisoformat(s[:10]) if s else None
T = lambda s: s == 'True'
F = lambda s: float(s) if s not in ('', None) else None
END = dt.date(2024, 12, 31); DAY = dt.timedelta(days=1); W = dt.timedelta(days=90)
A = {a['account_id']: a for a in acc}
S = {s['subscription_id']: s for s in sub}
sb, evd, fua, tka, fus = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
for s in sub: sb[s['account_id']].append(s)
for e in ce: evd[e['account_id']].append(D(e['churn_date']))
for u in fu: fua[S[u['subscription_id']]['account_id']].append(u); fus[u['subscription_id']].append(u)
for t in tk: tka[t['account_id']].append(t)
mrr = lambda s: float(s['mrr_amount'])
paid = lambda s: mrr(s) > 0
sd = lambda s: D(s['start_date']); ed = lambda s: D(s['end_date'])
def active_on(s, d): return sd(s) <= d and (not s['end_date'] or ed(s) > d)
def wcsv(name, head, rows):
    with open(f"{TAB}/{name}", 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(head); w.writerows(rows)
def wilson(k, n, z=1.96):
    if not n: return (0, 0)
    p = k / n; den = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / den, (c + h) / den)
def seat_b(n):
    n = int(n); return "01-05" if n <= 5 else "06-10" if n <= 10 else "11-20" if n <= 20 else "21-50" if n <= 50 else "51+"
def ten_b(m): return "0-3 meses" if m < 3 else "3-6 meses" if m < 6 else "6-12 meses" if m < 12 else "12+ meses"
BUCKETS = ["0-3 meses", "3-6 meses", "6-12 meses", "12+ meses"]
rng = np.random.default_rng(42)
pr = print

pr("=== 1. DEFINICOES POR CONTA")
rows = []; combo = Counter()
for a in acc:
    aid = a['account_id']; l = sb[aid]; last = max(l, key=lambda s: s['start_date'])
    act = [s for s in l if paid(s) and active_on(s, END)]
    mA = sum(mrr(s) for s in act); mB = mrr(max(act, key=lambda s: s['start_date'])) if act else 0
    k = (T(a['churn_flag']), bool(evd[aid]), T(last['churn_flag'])); combo[k] += 1
    rows.append([aid, a['account_name'], a['country'], a['industry'], a['referral_source'], a['plan_tier'], a['seats'], a['signup_date'],
                 'Sim' if k[0] else 'Nao', len(evd[aid]), min(evd[aid]) if evd[aid] else '', max(evd[aid]) if evd[aid] else '',
                 len(l), sum(T(s['churn_flag']) for s in l), 'Sim' if k[2] else 'Nao', len(act), round(mA), round(mB)])
wcsv('01_definicoes_de_churn_por_conta.csv', ['account_id', 'account_name', 'country', 'industry', 'referral_source', 'plan_tier_inicial', 'seats', 'signup_date',
     'churn_flag_accounts', 'eventos_churn_events', 'primeiro_churn_date', 'ultimo_churn_date', 'assinaturas', 'assinaturas_encerradas',
     'ultima_assinatura_encerrada', 'assinaturas_pagas_ativas_31dez24', 'mrr_ativo_31dez24_leituraA', 'mrr_ativo_31dez24_leituraB'], rows)
pr("combinacoes (flag accounts, tem evento, ultima assinatura encerrada) -> contas")
for k, v in sorted(combo.items(), key=lambda x: -x[1]): pr(f"  {k}: {v}")
pr(f"contas com pelo menos 1 assinatura paga ativa em 31/12/24: {sum(1 for r in rows if r[15] > 0)} | MRR ativo A {sum(r[16] for r in rows):,} | B {sum(r[17] for r in rows):,}")
pr(f"contas com churn_flag=Sim e assinatura paga ativa em 31/12/24: {sum(1 for r in rows if r[8]=='Sim' and r[15] > 0)} de {sum(1 for r in rows if r[8]=='Sim')}")

pr("\n=== 2. PERIODOS")
def periods(kind):
    out = []; y, m = 2023, 1
    while (y, m) <= (2024, 12):
        step = 3 if kind == 'q' else 1
        s0 = dt.date(y, m, 1); ny, nm = (y + (m + step - 1) // 12, (m + step - 1) % 12 + 1)
        e0 = dt.date(ny, nm, 1) - DAY
        lab = f"{y}-T{(m-1)//3+1}" if kind == 'q' else f"{y}-{m:02d}"
        out.append((lab, s0, e0)); y, m = ny, nm
    return out
H2 = ['periodo', 'signups', 'contas_pagas_ativas_inicio', 'mrr_ativo_inicio', 'assinaturas_pagas_novas', 'mrr_novo', 'eventos_churn', 'contas_com_evento',
      'eventos_por_conta_ativa', 'assinaturas_pagas_encerradas', 'mrr_encerrado', 'pct_mrr_encerrado_sobre_inicio', 'pct_mrr_encerrado_sobre_inicio_mais_novo']
def prow(lab, s0, e0):
    act = [s for s in sub if paid(s) and sd(s) <= s0 and (not s['end_date'] or ed(s) >= s0)]
    accs = {s['account_id'] for s in act}; m0 = sum(mrr(s) for s in act)
    new = [s for s in sub if paid(s) and s0 <= sd(s) <= e0]; mn = sum(mrr(s) for s in new)
    lost = [s for s in sub if paid(s) and T(s['churn_flag']) and s0 <= ed(s) <= e0]; ml = sum(mrr(s) for s in lost)
    evs = [e for e in ce if s0 <= D(e['churn_date']) <= e0]
    return [lab, sum(1 for a in acc if s0 <= D(a['signup_date']) <= e0), len(accs), round(m0), len(new), round(mn), len(evs), len({e['account_id'] for e in evs}),
            round(len(evs) / len(accs), 3) if accs else '', len(lost), round(ml), round(100 * ml / m0, 1) if m0 else '', round(100 * ml / (m0 + mn), 1) if m0 + mn else '']
qrows = [prow(*p) for p in periods('q')]; mrows = [prow(*p) for p in periods('m')]
wcsv('02_trimestres.csv', H2, qrows); wcsv('03_meses.csv', H2, mrows)
pr(" | ".join(H2))
for r in qrows: pr(" | ".join(str(x) for x in r))
pr("-- meses 2024")
for r in mrows[12:]: pr(" | ".join(str(x) for x in r))

pr("\n=== 3. SUPORTE")
H3 = ['periodo', 'tickets', 'satisfacao_media', 'pct_sem_nota', 'nota_1', 'nota_2', 'nota_3', 'nota_4', 'nota_5', 'resolucao_media_h', 'primeira_resposta_media_min', 'pct_escalados', 'pct_high_urgent']
def srow(lab, l):
    sat = [F(t['satisfaction_score']) for t in l if F(t['satisfaction_score']) is not None]; c = Counter(int(x) for x in sat)
    return [lab, len(l), round(sum(sat) / len(sat), 2) if sat else '', round(100 * (len(l) - len(sat)) / len(l), 1), c[1], c[2], c[3], c[4], c[5],
            round(sum(F(t['resolution_time_hours']) for t in l) / len(l), 1), round(sum(F(t['first_response_time_minutes']) for t in l) / len(l)),
            round(100 * sum(T(t['escalation_flag']) for t in l) / len(l), 1), round(100 * sum(t['priority'] in ('high', 'urgent') for t in l) / len(l), 1)]
tq = defaultdict(list)
for t in tk:
    d = D(t['submitted_at']); tq[f"{d.year}-T{(d.month-1)//3+1}"].append(t)
srows = [srow(k, v) for k, v in sorted(tq.items())] + [srow('TOTAL', tk)]
evset = {e['account_id'] for e in ce}
srows += [srow('contas com evento de churn', [t for t in tk if t['account_id'] in evset]), srow('contas sem evento de churn', [t for t in tk if t['account_id'] not in evset])]
wcsv('04_suporte.csv', H3, srows)
pr(" | ".join(H3))
for r in srows: pr(" | ".join(str(x) for x in r))
vals = sorted({t['satisfaction_score'] for t in tk}); pr("valores distintos de satisfaction_score:", vals)

pr("\n=== 4. USO")
def qlab(d): return f"{d.year}-T{(d.month-1)//3+1}"
dims_u = {'TOTAL': lambda s, a: 'todas', 'industry': lambda s, a: a['industry'], 'country': lambda s, a: a['country'], 'referral_source': lambda s, a: a['referral_source'],
          'plan_tier (assinatura)': lambda s, a: s['plan_tier'], 'billing_frequency': lambda s, a: s['billing_frequency'], 'is_trial (assinatura)': lambda s, a: s['is_trial']}
agg = defaultdict(lambda: [0, 0, set()])
for u in fu:
    s = S[u['subscription_id']]; a = A[s['account_id']]; q = qlab(D(u['usage_date']))
    for dn, fn in dims_u.items():
        r = agg[(dn, fn(s, a), q)]; r[0] += int(u['usage_count']); r[1] += int(u['error_count']); r[2].add(s['account_id'])
urows = []; usum = []
for (dn, seg, q), r in sorted(agg.items()):
    urows.append([dn, seg, q, r[0], len(r[2]), round(r[0] / len(r[2]), 1), round(100 * r[1] / r[0], 2)])
wcsv('05_uso_por_trimestre_e_segmento.csv', ['dimensao', 'segmento', 'trimestre', 'usage_count', 'contas_usando', 'uso_por_conta', 'pct_erros_por_uso'], urows)
segs = sorted({(dn, seg) for dn, seg, _ in agg})
for dn, seg in segs:
    y23 = sum(agg[(dn, seg, f"2023-T{i}")][0] for i in range(1, 5)); y24 = sum(agg[(dn, seg, f"2024-T{i}")][0] for i in range(1, 5))
    t3, t4 = agg[(dn, seg, '2024-T3')][0], agg[(dn, seg, '2024-T4')][0]
    usum.append([dn, seg, y23, y24, round(100 * (y24 - y23) / y23, 1), t3, t4, round(100 * (t4 - t3) / t3, 1)])
wcsv('06_uso_variacao_por_segmento.csv', ['dimensao', 'segmento', 'usage_count_2023', 'usage_count_2024', 'var_pct_2023_2024', 'usage_count_2024T3', 'usage_count_2024T4', 'var_pct_T3_T4'], usum)
for r in usum: pr(" | ".join(str(x) for x in r))
life = np.array([((ed(s) if s['end_date'] else END) - sd(s)).days for s in sub]); nrow = np.array([len(fus[s['subscription_id']]) for s in sub])
pr(f"registros de uso por assinatura: media {nrow.mean():.2f}, min {nrow.min()}, max {nrow.max()} | correlacao com duracao da assinatura: {np.corrcoef(life, nrow)[0,1]:.3f}")
for lo, hi in [(0, 30), (30, 90), (90, 180), (180, 365), (365, 10000)]:
    m = (life >= lo) & (life < hi); pr(f"  duracao {lo}-{hi} dias: {m.sum()} assinaturas, {nrow[m].mean():.2f} registros de uso em media")
ud = [D(u['usage_date']) for u in fu]
out_life = sum(1 for u in fu if not (sd(S[u['subscription_id']]) <= D(u['usage_date']) <= (ed(S[u['subscription_id']]) or END)))
pr(f"registros de uso fora do periodo de vida da propria assinatura: {out_life} de {len(fu)} ({100*out_life/len(fu):.1f}%)")

pr("\n=== 5. PESO DO CHURN (assinaturas pagas encerradas)")
lostsubs = [s for s in sub if paid(s) and T(s['churn_flag'])]
tot = sum(mrr(s) for s in lostsubs); r5 = []
for lo, hi, lab in [(0, 500, 'ate 500'), (500, 1000, '500-1.000'), (1000, 5000, '1.000-5.000'), (5000, 1e12, 'acima de 5.000')]:
    l = [s for s in lostsubs if lo < mrr(s) <= hi]
    r5.append([lab, len(l), round(100 * len(l) / len(lostsubs), 1), round(sum(mrr(s) for s in l)), round(100 * sum(mrr(s) for s in l) / tot, 1)])
wcsv('07_peso_do_churn_por_faixa_de_mrr.csv', ['faixa_mrr_mensal', 'assinaturas_encerradas', 'pct_assinaturas', 'mrr_perdido', 'pct_mrr_perdido'], r5)
for r in r5: pr(" | ".join(str(x) for x in r))
ms = sorted((mrr(s) for s in lostsubs), reverse=True)
pr(f"total {len(lostsubs)} assinaturas, MRR {tot:,.0f} | top 10% = {100*sum(ms[:len(ms)//10])/tot:.1f}% | top 20% = {100*sum(ms[:len(ms)//5])/tot:.1f}%")
byacc = Counter()
for s in lostsubs: byacc[s['account_id']] += mrr(s)
pr(f"contas com MRR perdido: {len(byacc)} | top 10 contas = {100*sum(v for _, v in byacc.most_common(10))/tot:.1f}% do MRR perdido | top 30 = {100*sum(v for _, v in byacc.most_common(30))/tot:.1f}%")
wcsv('08_contas_por_mrr_perdido.csv', ['account_id', 'account_name', 'country', 'industry', 'referral_source', 'mrr_perdido_total', 'pct_do_total'],
     [[a, A[a]['account_name'], A[a]['country'], A[a]['industry'], A[a]['referral_source'], round(v), round(100 * v / tot, 2)] for a, v in byacc.most_common()])

pr("\n=== 6. SEGMENTOS: MRR PERDIDO EM 2024 (assinaturas pagas expostas em 2024) + teste de permutacao")
Y0 = dt.date(2024, 1, 1)
exp = [s for s in sub if paid(s) and sd(s) <= END and (not s['end_date'] or ed(s) >= Y0)]
y = np.array([1 if T(s['churn_flag']) and s['end_date'] and Y0 <= ed(s) <= END else 0 for s in exp], float)
mv = np.array([mrr(s) for s in exp])
dims_s = {'country': lambda s: A[s['account_id']]['country'], 'industry': lambda s: A[s['account_id']]['industry'], 'referral_source': lambda s: A[s['account_id']]['referral_source'],
          'seats (conta)': lambda s: seat_b(A[s['account_id']]['seats']), 'plan_tier (assinatura)': lambda s: s['plan_tier'], 'billing_frequency': lambda s: s['billing_frequency'],
          'auto_renew_flag': lambda s: s['auto_renew_flag'], 'upgrade_flag': lambda s: s['upgrade_flag'], 'downgrade_flag': lambda s: s['downgrade_flag']}
r6 = []
for dn, fn in dims_s.items():
    lab = np.array([fn(s) for s in exp]); cats = sorted(set(lab)); masks = [lab == c for c in cats]
    ns = [m.sum() for m in masks]; mts = [mv[m].sum() for m in masks]
    def stat(yy):
        p = yy.mean(); pm = (yy * mv).sum() / mv.sum(); c = mm = 0.0
        for mk, n, mt in zip(masks, ns, mts):
            o = yy[mk].sum(); e = n * p; c += (o - e) ** 2 / e + (o - e) ** 2 / (n - e)
            ml = (yy[mk] * mv[mk]).sum(); em = mt * pm; mm += (ml - em) ** 2 / em
        return c, mm
    oc, om = stat(y); gc = gm = 0
    for _ in range(2000):
        c, mm = stat(rng.permutation(y)); gc += c >= oc; gm += mm >= om
    for c, mk in zip(cats, masks):
        r6.append([dn, c, int(mk.sum()), int(y[mk].sum()), round(100 * y[mk].mean(), 1), round(mv[mk].sum()), round((y[mk] * mv[mk]).sum()),
                   round(100 * (y[mk] * mv[mk]).sum() / mv[mk].sum(), 1), round((gc + 1) / 2001, 3), round((gm + 1) / 2001, 3)])
    pr(f"{dn}: p contagem {(gc+1)/2001:.3f} | p MRR {(gm+1)/2001:.3f} | " + " · ".join(f"{r[1]} {r[4]}% subs / {r[7]}% MRR" for r in r6 if r[0] == dn))
wcsv('09_segmentos_mrr_perdido_2024.csv', ['dimensao', 'segmento', 'assinaturas_pagas_expostas_2024', 'encerradas_2024', 'pct_encerradas', 'mrr_exposto', 'mrr_perdido',
     'pct_mrr_perdido', 'p_valor_contagem_dimensao', 'p_valor_mrr_dimensao'], r6)
pr(f"total 2024: {len(exp)} assinaturas expostas, {int(y.sum())} encerradas ({100*y.mean():.1f}%), MRR exposto {mv.sum():,.0f}, perdido {(y*mv).sum():,.0f} ({100*(y*mv).sum()/mv.sum():.1f}%)")

pr("\n=== 7. IDADE DA CONTA x CHURN NOS 90 DIAS SEGUINTES (snapshots trimestrais)")
snaps = [dt.date(2023, 6, 30), dt.date(2023, 9, 30), dt.date(2023, 12, 31), dt.date(2024, 3, 31), dt.date(2024, 6, 30), dt.date(2024, 9, 30)]
recs = []
for t in snaps:
    for a in acc:
        aid = a['account_id']
        if D(a['signup_date']) > t: continue
        act = [s for s in sb[aid] if paid(s) and active_on(s, t)]
        mA = sum(mrr(s) for s in act)
        lostm = sum(mrr(s) for s in act if T(s['churn_flag']) and s['end_date'] and t < ed(s) <= t + W)
        recs.append(dict(t=t, aid=aid, b=ten_b((t - D(a['signup_date'])).days / 30.44), ev=any(t < d <= t + W for d in evd[aid]), mA=mA, lost=lostm,
                         upg=any(T(s['upgrade_flag']) and t - W < sd(s) <= t for s in sb[aid]), dng=any(T(s['downgrade_flag']) and t - W < sd(s) <= t for s in sb[aid])))
r7 = []
for scope, flt in [('todos os snapshots (jun/23 a set/24)', lambda r: True), ('sem o ultimo snapshot (exclui out-dez/24)', lambda r: r['t'] < dt.date(2024, 9, 30))]:
    for b in BUCKETS:
        l = [r for r in recs if r['b'] == b and flt(r)]; k = sum(r['ev'] for r in l); lo, hi = wilson(k, len(l))
        ma = sum(r['mA'] for r in l); ml = sum(r['lost'] for r in l)
        r7.append([scope, b, len(l), k, round(100 * k / len(l), 1), round(100 * lo, 1), round(100 * hi, 1), round(ma), round(ml), round(100 * ml / ma, 1) if ma else ''])
wcsv('10_idade_da_conta_x_churn_90d.csv', ['escopo', 'idade_da_conta', 'conta_snapshots', 'com_evento_90d', 'pct_evento_90d', 'ic95_min', 'ic95_max', 'mrr_ativo', 'mrr_perdido_90d', 'pct_mrr_perdido_90d'], r7)
for r in r7: pr(" | ".join(str(x) for x in r))
pr("-- por snapshot: % evento 90d em contas <6 meses vs >=6 meses")
for t in snaps:
    a_ = [r for r in recs if r['t'] == t and r['b'] in BUCKETS[:2]]; b_ = [r for r in recs if r['t'] == t and r['b'] in BUCKETS[2:]]
    pr(f"  {t}: <6m {sum(r['ev'] for r in a_)}/{len(a_)} = {100*sum(r['ev'] for r in a_)/max(len(a_),1):.1f}% | >=6m {sum(r['ev'] for r in b_)}/{len(b_)} = {100*sum(r['ev'] for r in b_)/max(len(b_),1):.1f}%")
for flag in ['upg', 'dng']:
    a_ = [r for r in recs if r[flag]]; b_ = [r for r in recs if not r[flag]]
    pr(f"{flag} nos 90d anteriores: evento 90d {sum(r['ev'] for r in a_)}/{len(a_)} = {100*sum(r['ev'] for r in a_)/len(a_):.1f}% | sem: {sum(r['ev'] for r in b_)}/{len(b_)} = {100*sum(r['ev'] for r in b_)/len(b_):.1f}%")
rate_mrr = {b: next(r[9] for r in r7 if r[0].startswith('todos') and r[1] == b) / 100 for b in BUCKETS}
rate_ev = {b: next(r[4] for r in r7 if r[0].startswith('todos') and r[1] == b) / 100 for b in BUCKETS}

pr("\n=== 8. CONSISTENCIA DOS CAMPOS DE churn_events")
cats_r = sorted({e['reason_code'] for e in ce}); cats_f = sorted({e['feedback_text'] or 'vazio' for e in ce})
rr = np.array([e['reason_code'] for e in ce]); ff = np.array([e['feedback_text'] or 'vazio' for e in ce])
def chi2(a, b):
    n = len(a); st_ = 0
    for x in cats_r:
        ma = a == x
        for z in cats_f:
            o = (ma & (b == z)).sum(); e_ = ma.sum() * (b == z).sum() / n; st_ += (o - e_) ** 2 / e_
    return st_
o = chi2(rr, ff); g = sum(chi2(rr, rng.permutation(ff)) >= o for _ in range(2000))
pr(f"reason_code x feedback_text: p permutacao {(g+1)/2001:.3f}")
r8 = [[x] + [int(((rr == x) & (ff == z)).sum()) for z in cats_f] for x in cats_r]
wcsv('11_motivo_x_comentario.csv', ['reason_code'] + cats_f, r8)
for r in r8: pr("  ", r)
pu = [(T(e['preceding_upgrade_flag']), any(T(s['upgrade_flag']) and D(e['churn_date']) - W <= sd(s) <= D(e['churn_date']) for s in sb[e['account_id']])) for e in ce]
pr(f"preceding_upgrade_flag vs upgrade em subscriptions nos 90d antes: {Counter(pu)}")
pr(f"is_reactivation=True: {sum(T(e['is_reactivation']) for e in ce)} | desses, conta tinha evento anterior: {sum(1 for e in ce if T(e['is_reactivation']) and any(d < D(e['churn_date']) for d in evd[e['account_id']]))}")
pr(f"eventos que NAO sao o primeiro da conta: {sum(1 for e in ce if any(d < D(e['churn_date']) for d in evd[e['account_id']]))} | desses com is_reactivation=True: {sum(1 for e in ce if T(e['is_reactivation']) and any(d < D(e['churn_date']) for d in evd[e['account_id']]))}")

pr("\n=== 9. CONTAS EM RISCO EM 31/12/2024")
r9 = []
for a in acc:
    aid = a['account_id']
    act = [s for s in sb[aid] if paid(s) and active_on(s, END)]
    if not act: continue
    mA = sum(mrr(s) for s in act); latest = max(act, key=lambda s: s['start_date'])
    tm = (END - D(a['signup_date'])).days / 30.44; b = ten_b(tm)
    u1 = [u for u in fua[aid] if END - W < D(u['usage_date']) <= END]; u0 = [u for u in fua[aid] if END - 2 * W < D(u['usage_date']) <= END - W]
    c1 = sum(int(u['usage_count']) for u in u1); c0 = sum(int(u['usage_count']) for u in u0); e1 = sum(int(u['error_count']) for u in u1)
    k1 = [t for t in tka[aid] if END - W < D(t['submitted_at']) <= END]
    r9.append([aid, a['account_name'], a['country'], a['industry'], a['referral_source'], latest['plan_tier'], latest['billing_frequency'], latest['auto_renew_flag'],
               a['signup_date'], round(tm, 1), b, len(act), round(mA), round(100 * rate_mrr[b], 1), round(mA * rate_mrr[b]), len(evd[aid]),
               max(evd[aid]).isoformat() if evd[aid] else '', len(k1), sum(T(t['escalation_flag']) for t in k1), sum(1 for t in k1 if not t['satisfaction_score']),
               c0, c1, round(100 * (c1 - c0) / c0, 1) if c0 else '', round(100 * e1 / c1, 2) if c1 else '',
               sum(T(s['upgrade_flag']) for s in sb[aid] if END - W < sd(s) <= END), sum(T(s['downgrade_flag']) for s in sb[aid] if END - W < sd(s) <= END)])
r9.sort(key=lambda r: -r[14])
H9 = ['account_id', 'account_name', 'country', 'industry', 'referral_source', 'plano_assinatura_mais_recente', 'billing_frequency', 'auto_renew', 'signup_date',
      'idade_meses', 'faixa_idade', 'assinaturas_pagas_ativas', 'mrr_ativo', 'taxa_historica_mrr_perdido_90d_da_faixa_pct', 'mrr_em_risco_90d_estimado',
      'eventos_churn_historico', 'ultimo_churn_date', 'tickets_90d', 'tickets_escalados_90d', 'tickets_sem_nota_90d', 'uso_90d_anteriores', 'uso_ultimos_90d',
      'var_uso_pct', 'pct_erros_por_uso_90d', 'upgrades_90d', 'downgrades_90d']
wcsv('12_contas_em_risco_31dez2024.csv', ['prioridade'] + H9, [[i + 1] + r for i, r in enumerate(r9)])
totA = sum(r[12] for r in r9); totR = sum(r[14] for r in r9)
pr(f"contas com assinatura paga ativa: {len(r9)} | MRR ativo {totA:,} | MRR em risco estimado 90d {totR:,} ({100*totR/totA:.1f}%)")
for b in BUCKETS:
    l = [r for r in r9 if r[10] == b]
    pr(f"  {b}: {len(l)} contas | MRR ativo {sum(r[12] for r in l):,} ({100*sum(r[12] for r in l)/totA:.1f}%) | em risco {sum(r[14] for r in l):,} ({100*sum(r[14] for r in l)/totR:.1f}% do risco)")
pr(f"top 25 contas = {100*sum(r[14] for r in r9[:25])/totR:.1f}% do MRR em risco | {100*sum(r[12] for r in r9[:25])/totA:.1f}% do MRR ativo")
new6 = [r for r in r9 if r[10] in BUCKETS[:2]]; save = lambda f: sum(r[14] for r in new6) * f
pr(f"cenario: reduzir em 20% a taxa das contas <6 meses -> MRR preservado por trimestre {save(0.2):,.0f} (x4 = {4*save(0.2):,.0f}/ano) | 50% -> {save(0.5):,.0f} (x4 = {4*save(0.5):,.0f}/ano)")
top = r9[:25]
pr(" | ".join(['#'] + [H9[i] for i in (0, 1, 2, 3, 5, 9, 12, 14, 15, 17, 18, 22, 23)]))
for i, r in enumerate(top): pr(" | ".join(str(x) for x in [i + 1] + [r[j] for j in (0, 1, 2, 3, 5, 9, 12, 14, 15, 17, 18, 22, 23)]))
by_ind = defaultdict(lambda: [0, 0, 0])
for r in r9:
    by_ind[(r[3])][0] += 1; by_ind[r[3]][1] += r[12]; by_ind[r[3]][2] += r[14]
pr("risco por industry:", {k: (v[0], v[1], v[2]) for k, v in sorted(by_ind.items(), key=lambda x: -x[1][2])})
