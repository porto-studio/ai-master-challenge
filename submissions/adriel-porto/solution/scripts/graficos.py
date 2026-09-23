import csv, os
from collections import defaultdict
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TAB, G = OUT + '/tabelas', OUT + '/graficos'
os.makedirs(G, exist_ok=True)
R = lambda n: list(csv.DictReader(open(f"{TAB}/{n}", encoding='utf-8')))
C1, C2, C3 = '#2a78d6', '#eb6834', '#1baf7a'
INK, INK2, MUTED, GRID, BASE, SURF = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7', '#fcfcfb'
plt.rcParams.update({'font.family': ['Helvetica Neue', 'Arial', 'sans-serif'], 'font.size': 10, 'text.color': INK, 'axes.labelcolor': INK2,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.edgecolor': BASE, 'figure.facecolor': SURF, 'axes.facecolor': SURF,
                     'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.6, 'axes.axisbelow': True, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.titlesize': 11, 'axes.titleweight': 'bold', 'axes.titlelocation': 'left', 'legend.frameon': False})
def fin(fig, name, note):
    fig.text(0.01, 0.01, note, color=MUTED, fontsize=8, ha='left', va='bottom')
    fig.tight_layout(rect=(0, 0.04, 1, 1)); fig.savefig(f"{G}/{name}", dpi=180); plt.close(fig)
def bar(ax, x, h, color, **kw): return ax.bar(x, h, color=color, edgecolor=SURF, linewidth=1.5, **kw)

q = R('02_trimestres.csv')
fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4))
labs = [r['periodo'].replace('-T', '\nT') for r in q]
b = bar(a1, labs, [int(r['eventos_churn']) for r in q], C1, width=0.7)
a1.set_title('Eventos de churn por trimestre'); a1.set_ylabel('eventos (churn_events)')
a1.bar_label(b, padding=2, color=INK2, fontsize=8)
pct = [float(r['pct_mrr_encerrado_sobre_inicio']) if r['pct_mrr_encerrado_sobre_inicio'] else None for r in q]
xs = [l for l, p in zip(labs, pct) if p is not None]; ys = [p for p in pct if p is not None]
a2.plot(xs, ys, color=C1, linewidth=2, marker='o', markersize=6, markeredgecolor=SURF, markeredgewidth=1.5)
a2.set_title('% do MRR ativo no início do trimestre\nque terminou encerrado (subscriptions)'); a2.set_ylabel('% do MRR'); a2.set_ylim(0, max(ys) * 1.2)
a2.annotate(f"{ys[-1]:.1f}%".replace('.', ','), (xs[-1], ys[-1]), textcoords='offset points', xytext=(-8, 8), ha='right', color=INK, fontweight='bold')
a2.annotate(f"{ys[-2]:.1f}%".replace('.', ','), (xs[-2], ys[-2]), textcoords='offset points', xytext=(-10, 6), ha='right', color=INK2)
fin(fig, '01_churn_por_trimestre.png', 'Fonte: churn_events.csv e subscriptions.csv (assinaturas pagas). Tabela: tabelas/02_trimestres.csv')

s = {r['periodo']: r for r in R('04_suporte.csv')}['TOTAL']
fig, ax = plt.subplots(figsize=(7, 3.8))
cats = ['nota 1', 'nota 2', 'nota 3', 'nota 4', 'nota 5', 'sem nota']
vals = [int(s['nota_1']), int(s['nota_2']), int(s['nota_3']), int(s['nota_4']), int(s['nota_5']), int(s['tickets']) - sum(int(s[f'nota_{i}']) for i in range(1, 6))]
b = bar(ax, cats, vals, [C1] * 5 + [BASE], width=0.7)
ax.bar_label(b, labels=[f"{v}" for v in vals], padding=2, color=INK2, fontsize=9)
ax.set_title('Notas de satisfação dos 2.000 tickets'); ax.set_ylabel('tickets')
fin(fig, '02_satisfacao_distribuicao.png', 'Fonte: support_tickets.csv. Nenhum ticket recebeu nota 1 ou 2. Tabela: tabelas/04_suporte.csv')

u = [r for r in R('05_uso_por_trimestre_e_segmento.csv') if r['dimensao'] == 'TOTAL']
fig, ax = plt.subplots(figsize=(8, 3.8))
ax.plot([r['trimestre'].replace('-T', '\nT') for r in u], [int(r['usage_count']) for r in u], color=C1, linewidth=2, marker='o', markersize=6, markeredgecolor=SURF, markeredgewidth=1.5)
ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{int(v):,}".replace(',', '.')))
ax.set_ylim(0, 36000); ax.set_title('Uso total do produto por trimestre (usage_count)'); ax.set_ylabel('usage_count')
ax.annotate(f"{int(u[0]['usage_count']):,}".replace(',', '.'), (0, int(u[0]['usage_count'])), textcoords='offset points', xytext=(0, 8), ha='center', color=INK2)
ax.annotate(f"{int(u[-1]['usage_count']):,}".replace(',', '.'), (len(u) - 1, int(u[-1]['usage_count'])), textcoords='offset points', xytext=(0, 8), ha='center', color=INK, fontweight='bold')
fin(fig, '03_uso_por_trimestre.png', 'Fonte: feature_usage.csv. Tabela: tabelas/05_uso_por_trimestre_e_segmento.csv')

d = R('01_definicoes_de_churn_por_conta.csv')
chs = ['event', 'other', 'ads', 'organic', 'partner']
tot = defaultdict(int); k1 = defaultdict(int); k2 = defaultdict(int); k3 = defaultdict(int)
for r in d:
    c = r['referral_source']; tot[c] += 1
    k1[c] += r['churn_flag_accounts'] == 'Sim'; k2[c] += int(r['eventos_churn_events']) > 0; k3[c] += r['ultima_assinatura_encerrada'] == 'Sim'
fig, axs = plt.subplots(1, 3, figsize=(12, 3.8), sharey=False)
for ax, k, col, title in [(axs[0], k1, C1, 'accounts.churn_flag'), (axs[1], k2, C2, 'churn_events (≥1 evento)'), (axs[2], k3, C3, 'última assinatura encerrada')]:
    vals = [100 * k[c] / tot[c] for c in chs]
    b = bar(ax, chs, vals, col, width=0.65)
    ax.bar_label(b, labels=[f"{v:.0f}%" for v in vals], padding=2, color=INK2, fontsize=9)
    ax.set_title(title); ax.set_ylim(0, max(vals) * 1.25)
axs[0].set_ylabel('% das contas do canal')
fig.suptitle('Taxa de churn por canal de aquisição: o ranking muda conforme a definição', x=0.01, ha='left', fontweight='bold', fontsize=12)
fin(fig, '04_canal_x_definicao_de_churn.png', 'Fonte: accounts, churn_events, subscriptions. Nenhuma diferença é estatisticamente significativa na dimensão inteira (permutação, p > 0,05).')

t = [r for r in R('10_idade_da_conta_x_churn_90d.csv') if r['escopo'].startswith('todos')]
fig, ax = plt.subplots(figsize=(7.5, 3.8))
v = [float(r['pct_evento_90d']) for r in t]; lo = [v[i] - float(r['ic95_min']) for i, r in enumerate(t)]; hi = [float(r['ic95_max']) - v[i] for i, r in enumerate(t)]
b = bar(ax, [r['idade_da_conta'] for r in t], v, C1, width=0.6)
ax.errorbar(range(len(t)), v, yerr=[lo, hi], fmt='none', ecolor=INK2, elinewidth=1, capsize=4)
for i, val in enumerate(v): ax.annotate(f"{val:.0f}%", (i, val + hi[i]), textcoords='offset points', xytext=(0, 4), ha='center', color=INK2, fontsize=9)
ax.set_title('Chance de ter evento de churn nos 90 dias seguintes,\npela idade da conta'); ax.set_ylabel('% das contas'); ax.set_ylim(0, max(x + y for x, y in zip(v, hi)) * 1.2)
fin(fig, '05_idade_da_conta.png', 'Fonte: accounts + churn_events, 6 fotos trimestrais (jun/23 a set/24). Barra fina = intervalo de confiança 95%. Tabela: tabelas/10')

p = R('07_peso_do_churn_por_faixa_de_mrr.csv')
fig, ax = plt.subplots(figsize=(8, 3.8))
x = range(len(p)); w = 0.38
b1 = bar(ax, [i - w / 2 for i in x], [float(r['pct_assinaturas']) for r in p], C1, width=w, label='% das assinaturas encerradas')
b2 = bar(ax, [i + w / 2 for i in x], [float(r['pct_mrr_perdido']) for r in p], C2, width=w, label='% do MRR perdido')
ax.bar_label(b1, labels=[f"{float(r['pct_assinaturas']):.0f}%" for r in p], padding=2, color=INK2, fontsize=9)
ax.bar_label(b2, labels=[f"{float(r['pct_mrr_perdido']):.0f}%" for r in p], padding=2, color=INK2, fontsize=9)
ax.set_xticks(list(x)); ax.set_xticklabels([f"MRR {r['faixa_mrr_mensal']}" for r in p]); ax.set_ylim(0, 70)
ax.set_title('Nem todo churn pesa igual'); ax.set_ylabel('%'); ax.legend(loc='upper left')
fin(fig, '06_peso_do_churn.png', 'Fonte: subscriptions.csv (408 assinaturas pagas encerradas). Tabela: tabelas/07_peso_do_churn_por_faixa_de_mrr.csv')
print('ok', sorted(os.listdir(G)))
