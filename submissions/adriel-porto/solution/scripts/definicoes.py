import csv, math
import numpy as np
from collections import defaultdict

import os
# caminho relativo a este script: solution/scripts/ -> solution/dashboards/data/
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data', 'ravenstack_')
L = lambda n: list(csv.DictReader(open(P + n + '.csv')))
acc, ce, sub = L('accounts'), L('churn_events'), L('subscriptions')
T = lambda s: s == 'True'
ids = [a['account_id'] for a in acc]
sb = defaultdict(list)
for s in sub: sb[s['account_id']].append(s)
defs = {
    'accounts.churn_flag': {a['account_id'] for a in acc if T(a['churn_flag'])},
    'churn_events (>=1 evento)': {e['account_id'] for e in ce},
    'subscriptions (ultima assinatura encerrada)': {a for a, l in sb.items() if T(max(l, key=lambda s: s['start_date'])['churn_flag'])},
}
def seat_b(n):
    n = int(n); return "01-05" if n <= 5 else "06-10" if n <= 10 else "11-20" if n <= 20 else "21-50" if n <= 50 else "51+"
dims = {'country': lambda a: a['country'], 'industry': lambda a: a['industry'], 'referral_source': lambda a: a['referral_source'],
        'plan_tier': lambda a: a['plan_tier'], 'is_trial': lambda a: a['is_trial'], 'seats': lambda a: seat_b(a['seats'])}
rng = np.random.default_rng(42)
def chi(labels, y):
    cats = np.unique(labels); stat = 0.0; p = y.mean()
    for c in cats:
        m = labels == c; n = m.sum(); o = y[m].sum(); e = n * p
        stat += (o - e) ** 2 / e + ((n - o) - (n - e)) ** 2 / (n - e)
    return stat
def ztest(k1, n1, k2, n2):
    p = (k1 + k2) / (n1 + n2); se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return math.erfc(abs(k1 / n1 - k2 / n2) / se / math.sqrt(2)) if se else 1
print("definicao | dimensao | taxa por grupo | maior vs menor | p (z-test maior x menor) | p (permutacao, dimensao inteira)")
for dn, st_ in defs.items():
    y = np.array([1 if i in st_ else 0 for i in ids])
    print(f"\n## {dn}: {y.sum()} contas ({100*y.mean():.1f}%)")
    for dim, fn in dims.items():
        lab = np.array([fn(a) for a in acc])
        obs = chi(lab, y)
        perm = sum(chi(lab, rng.permutation(y)) >= obs for _ in range(2000))
        rates = {c: (y[lab == c].sum(), (lab == c).sum()) for c in np.unique(lab)}
        hi = max(rates, key=lambda c: rates[c][0] / rates[c][1]); lo = min(rates, key=lambda c: rates[c][0] / rates[c][1])
        txt = " · ".join(f"{c} {100*k/n:.1f}% ({k}/{n})" for c, (k, n) in sorted(rates.items(), key=lambda x: -x[1][0] / x[1][1]))
        print(f"{dim} | {txt} | {hi} vs {lo} | {ztest(*rates[hi], *rates[lo]):.3f} | {(perm+1)/2001:.3f}")
print("\n## sobreposicao entre definicoes (contas)")
names = list(defs)
for i in range(3):
    for j in range(i + 1, 3):
        a, b = defs[names[i]], defs[names[j]]
        print(f"{names[i]} x {names[j]}: ambos {len(a & b)} | so primeiro {len(a - b)} | so segundo {len(b - a)} | Jaccard {len(a & b)/len(a | b):.2f}")
