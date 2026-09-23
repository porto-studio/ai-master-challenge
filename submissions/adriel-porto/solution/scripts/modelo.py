import csv, datetime as dt
import numpy as np
from collections import defaultdict

import os
# caminho relativo a este script: solution/scripts/ -> solution/dashboards/data/
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data', 'ravenstack_')
L = lambda n: list(csv.DictReader(open(P + n + '.csv')))
acc, ce, fu, sub, tk = L('accounts'), L('churn_events'), L('feature_usage'), L('subscriptions'), L('support_tickets')
D = lambda s: dt.date.fromisoformat(s[:10]) if s else None
T = lambda s: s == 'True'
F = lambda s: float(s) if s not in ('', None) else None
END = dt.date(2024, 12, 31)
W = dt.timedelta(days=90)
A = {a['account_id']: a for a in acc}
S = {s['subscription_id']: s for s in sub}
sb, ev, fua, tka = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
for s in sub: sb[s['account_id']].append(s)
for e in ce: ev[e['account_id']].append(D(e['churn_date']))
for u in fu: fua[S[u['subscription_id']]['account_id']].append((D(u['usage_date']), int(u['usage_count']), int(u['error_count']), T(u['is_beta_feature']), u['feature_name']))
for t in tk: tka[t['account_id']].append((D(t['submitted_at']), F(t['satisfaction_score']), T(t['escalation_flag']), t['priority'], F(t['resolution_time_hours'])))
IND = sorted({a['industry'] for a in acc}); REF = sorted({a['referral_source'] for a in acc}); PL = ['Basic', 'Pro', 'Enterprise']

def feats(a, t):
    ac = A[a]
    act = [s for s in sb[a] if D(s['start_date']) <= t and (not s['end_date'] or D(s['end_date']) > t)]
    latest = max(act, key=lambda s: s['start_date']) if act else (max([s for s in sb[a] if D(s['start_date']) <= t], key=lambda s: s['start_date'], default=None))
    mrrB = float(latest['mrr_amount']) if latest and latest in act else 0.0
    mrrA = sum(float(s['mrr_amount']) for s in act)
    recent = [s for s in sb[a] if t - W < D(s['start_date']) <= t]
    u1 = [x for x in fua[a] if t - W < x[0] <= t]; u0 = [x for x in fua[a] if t - 2 * W < x[0] <= t - W]
    c1 = sum(x[1] for x in u1); c0 = sum(x[1] for x in u0); e1 = sum(x[2] for x in u1)
    k1 = [x for x in tka[a] if t - W < x[0] <= t]
    sat = [x[1] for x in k1 if x[1] is not None]
    f = {
        'mrr_B_log': np.log1p(mrrB), 'mrr_A_log': np.log1p(mrrA), 'assinaturas_ativas': len(act), 'seats_log': np.log1p(int(ac['seats'])),
        'tenure_meses': (t - D(ac['signup_date'])).days / 30.44, 'annual': 1.0 if latest and latest['billing_frequency'] == 'annual' else 0.0,
        'auto_renew': 1.0 if latest and T(latest['auto_renew_flag']) else 0.0, 'trial_atual': 1.0 if latest and T(latest['is_trial']) else 0.0,
        'upgrades_90d': sum(T(s['upgrade_flag']) for s in recent), 'downgrades_90d': sum(T(s['downgrade_flag']) for s in recent),
        'churns_anteriores': sum(1 for d in ev[a] if d <= t),
        'uso_90d_log': np.log1p(c1), 'tendencia_uso': (c1 - c0) / (c0 + 1), 'erro_por_uso': e1 / c1 if c1 else 0.0,
        'beta_share': (sum(x[3] for x in u1) / len(u1)) if u1 else 0.0, 'features_distintas': len({x[4] for x in u1}),
        'tickets_90d': len(k1), 'escalados_90d': sum(x[2] for x in k1), 'urgentes_90d': sum(x[3] in ('urgent', 'high') for x in k1),
        'satisf_media': (sum(sat) / len(sat)) if sat else 4.0, 'satisf_ausente': 0.0 if sat else 1.0,
    }
    for p in PL: f['plano_' + p] = 1.0 if latest and latest['plan_tier'] == p else 0.0
    for i in IND: f['ind_' + i] = 1.0 if ac['industry'] == i else 0.0
    for r in REF: f['ref_' + r] = 1.0 if ac['referral_source'] == r else 0.0
    f['pais_US'] = 1.0 if ac['country'] == 'US' else 0.0
    return f

def target_event(a, t): return 1 if any(t < d <= t + W for d in ev[a]) else 0
def target_sub(a, t): return 1 if any(s['end_date'] and T(s['churn_flag']) and float(s['mrr_amount']) > 0 and t < D(s['end_date']) <= t + W for s in sb[a]) else 0

def dataset(t, tgt):
    ids = [a for a in A if D(A[a]['signup_date']) <= t]
    fs = [feats(a, t) for a in ids]
    names = list(fs[0])
    return ids, names, np.array([[f[n] for n in names] for f in fs], float), np.array([tgt(a, t) for a in ids], float)

def fit(X, y, lam=1.0, it=3000, lr=0.1):
    mu, sd = X.mean(0), X.std(0) + 1e-9; Z = (X - mu) / sd
    w = np.zeros(Z.shape[1]); b = np.log((y.mean() + 1e-6) / (1 - y.mean() + 1e-6))
    for _ in range(it):
        p = 1 / (1 + np.exp(-(Z @ w + b)))
        w -= lr * (Z.T @ (p - y) / len(y) + lam * w / len(y)); b -= lr * (p - y).mean()
    return w, b, mu, sd
def pred(m, X): w, b, mu, sd = m; return 1 / (1 + np.exp(-(((X - mu) / sd) @ w + b)))
def auc(y, s):
    o = np.argsort(s); r = np.empty(len(s)); r[o] = np.arange(1, len(s) + 1)
    n1 = y.sum(); n0 = len(y) - n1
    return (r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0) if n1 and n0 else float('nan')
def lift(y, s, frac=0.2):
    k = max(int(len(s) * frac), 1); top = np.argsort(-s)[:k]
    return y[top].mean() / y.mean() if y.mean() else float('nan'), y[top].sum() / y.sum() if y.sum() else float('nan')

snaps = [dt.date(2024, 3, 31), dt.date(2024, 6, 30), dt.date(2024, 9, 30)]
rng = np.random.default_rng(7)
for tname, tgt in [('churn_events nos 90 dias seguintes', target_event), ('assinatura paga encerrada (churn_flag) nos 90 dias seguintes', target_sub)]:
    print(f"\n######## ALVO: {tname}")
    data = {t: dataset(t, tgt) for t in snaps}
    for t in snaps: print(f"  snapshot {t}: {len(data[t][0])} contas, positivos {int(data[t][3].sum())} ({100*data[t][3].mean():.1f}%)")
    Xtr = np.vstack([data[t][2] for t in snaps[:2]]); ytr = np.concatenate([data[t][3] for t in snaps[:2]])
    ids_te, names, Xte, yte = data[snaps[2]]
    m = fit(Xtr, ytr)
    s = pred(m, Xte)
    print(f"  VALIDACAO TEMPORAL (treina mar+jun, testa set->dez): AUC {auc(yte, s):.3f} | lift top20% {lift(yte, s)[0]:.2f}x, captura {100*lift(yte, s)[1]:.0f}% dos positivos")
    aucs = [auc(yte, rng.permutation(s)) for _ in range(500)]
    print(f"  AUC de ranking aleatorio: media {np.mean(aucs):.3f}, 95% entre {np.percentile(aucs, 2.5):.3f} e {np.percentile(aucs, 97.5):.3f}")
    base = {'so churns_anteriores': names.index('churns_anteriores'), 'so tenure': names.index('tenure_meses'), 'so mrr_A': names.index('mrr_A_log'), 'so assinaturas_ativas': names.index('assinaturas_ativas'), 'so tendencia_uso': names.index('tendencia_uso'), 'so satisf_media (inv)': names.index('satisf_media'), 'so erro_por_uso': names.index('erro_por_uso')}
    for bn, j in base.items():
        sc = Xte[:, j] * (-1 if 'inv' in bn else 1)
        print(f"    baseline {bn}: AUC {auc(yte, sc):.3f}")
    w = m[0]; order = np.argsort(-np.abs(w))
    print("  pesos padronizados (top 12): " + " | ".join(f"{names[i]} {w[i]:+.2f}" for i in order[:12]))
    # permutacao de alvo no treino: quanto AUC sai por acaso com esse pipeline
    null = []
    for _ in range(30):
        mm = fit(Xtr, rng.permutation(ytr), it=800); null.append(auc(yte, pred(mm, Xte)))
    print(f"  AUC com alvo embaralhado no treino (30x): media {np.mean(null):.3f}, max {np.max(null):.3f}")
    if tgt is target_event:
        mfull = fit(np.vstack([data[t][2] for t in snaps]), np.concatenate([data[t][3] for t in snaps]))
        ids_end, _, Xend, _ = dataset(END, tgt)
        pend = pred(mfull, Xend)
        with open('scores_end.csv', 'w', newline='') as fh:
            wr = csv.writer(fh); wr.writerow(['account_id', 'prob'] + names)
            for i, a in enumerate(ids_end): wr.writerow([a, f"{pend[i]:.4f}"] + [f"{v:.4f}" for v in Xend[i]])
        print(f"  scores em 31/12/2024 salvos: {len(ids_end)} contas")
