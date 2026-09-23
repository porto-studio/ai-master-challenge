import pandas as pd, numpy as np, stats_min as SM
pd.set_option("display.width",220); pd.set_option("display.max_columns",60)
import os
# caminho relativo: solution/cruzamento-uso-x-tickets/ -> solution/dashboards/data/
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data') + '/'
acc=pd.read_csv(B+"ravenstack_accounts.csv"); sub=pd.read_csv(B+"ravenstack_subscriptions.csv")
fu =pd.read_csv(B+"ravenstack_feature_usage.csv").drop_duplicates(subset="usage_id")
st =pd.read_csv(B+"ravenstack_support_tickets.csv")
fu["account_id"]=fu.subscription_id.map(sub.set_index("subscription_id").account_id)
fu["dt"]=pd.to_datetime(fu.usage_date); st["dt"]=pd.to_datetime(st.submitted_at)

print("========== A) VOLUME: erros de uso x volume de tickets (por conta, vida toda)")
g=fu.groupby("account_id"); h=st.groupby("account_id")
P=pd.DataFrame(index=acc.account_id)
P["uso_count"]=g.usage_count.sum(); P["erros"]=g.error_count.sum(); P["uso_ev"]=g.size()
P["beta_ev"]=g.is_beta_feature.sum(); P["tk_n"]=h.size().reindex(acc.account_id); P["tk_escal"]=h.escalation_flag.sum()
P["tk_sat"]=h.satisfaction_score.mean(); P["tk_alta"]=st[st.priority.isin(["high","urgent"])].groupby("account_id").size()
P=P.fillna({"tk_n":0,"tk_escal":0,"tk_alta":0})
P["taxa_erro"]=P.erros/P.uso_count
for x,y in [("erros","tk_n"),("uso_count","tk_n"),("uso_ev","tk_n"),("taxa_erro","tk_n"),
            ("erros","tk_escal"),("erros","tk_alta"),("taxa_erro","tk_sat"),("beta_ev","tk_n"),("uso_count","tk_sat")]:
    r,p=SM.spearman(P[x],P[y]); print(f"Spearman {x:10s} x {y:9s}: rho={r:+.3f}  p={p:.4f}  (n={P[[x,y]].dropna().shape[0]})")

print("\n-- quartis de erro acumulado por conta x tickets --")
P["q_erro"]=pd.qcut(P.erros,4,labels=["Q1 menos erros","Q2","Q3","Q4 mais erros"])
print(P.groupby("q_erro",observed=True).agg(contas=("tk_n","size"),erros_medios=("erros","mean"),uso_count_medio=("uso_count","mean"),
        tickets_medios=("tk_n","mean"),escalacoes=("tk_escal","mean"),satisfacao=("tk_sat","mean")).round(3))
a=P.loc[P.q_erro=="Q1 menos erros","tk_n"]; b=P.loc[P.q_erro=="Q4 mais erros","tk_n"]
print("Q1 vs Q4 em tickets: p(Mann-Whitney)=%.4f"%SM.mannwhitney_p(a,b)[1])

print("\n========== B) TEMPO: houve erro/uso ANTES do ticket? (janela de 7 dias antes de cada ticket)")
usos=fu[["account_id","dt","usage_count","error_count","is_beta_feature","feature_name"]].sort_values(["account_id","dt"])
por_conta={k:v for k,v in usos.groupby("account_id")}
rng=np.random.default_rng(42)
def janela_stats(aid,ref,dias=7):
    d=por_conta.get(aid)
    if d is None: return (0,0,0)
    m=(d.dt<ref)&(d.dt>=ref-pd.Timedelta(days=dias))
    s=d[m]
    return (len(s), s.error_count.sum(), s.usage_count.sum())
reais=[]; placebo=[]
lim=fu.groupby("account_id").dt.agg(["min","max"])
for aid,ref in zip(st.account_id,st.dt):
    reais.append(janela_stats(aid,ref))
    lo,hi=lim.loc[aid] if aid in lim.index else (None,None)
    if lo is not None and hi is not None and hi>lo:
        fake=lo+pd.Timedelta(days=int(rng.integers(0,max((hi-lo).days,1))))
        placebo.append(janela_stats(aid,fake))
R=pd.DataFrame(reais,columns=["eventos","erros","usos"]); Q=pd.DataFrame(placebo,columns=["eventos","erros","usos"])
print(f"tickets analisados: {len(R)} | datas-placebo sorteadas na mesma conta: {len(Q)}")
for c in ["eventos","erros","usos"]:
    p=SM.mannwhitney_p(R[c],Q[c])[1]
    print(f"7 dias antes — {c}: media antes do ticket={R[c].mean():.3f} | media em data aleatoria={Q[c].mean():.3f} | p={p:.4f}")
print("tickets sem NENHUM uso nos 7 dias anteriores: %.1f%% | placebo: %.1f%%"%((R.eventos==0).mean()*100,(Q.eventos==0).mean()*100))
print("tickets com ALGUM erro nos 7 dias anteriores: %.1f%% | placebo: %.1f%%"%((R.erros>0).mean()*100,(Q.erros>0).mean()*100))

print("\n-- mesma comparacao so para tickets escalados / urgentes --")
esc=st.escalation_flag.values.astype(bool); alta=st.priority.isin(["high","urgent"]).values
for lab,msk in [("escalados",esc),("high+urgent",alta)]:
    sub_r=R[msk]
    print(f"{lab}: n={len(sub_r)} | erros 7d antes={sub_r.erros.mean():.3f} (geral {R.erros.mean():.3f}, placebo {Q.erros.mean():.3f}) | p vs placebo={SM.mannwhitney_p(sub_r.erros,Q.erros)[1]:.4f}")

print("\n========== C) POR FEATURE: uso nos 7 dias antes dos tickets vs participacao no uso total")
ant=[]
for aid,ref in zip(st.account_id,st.dt):
    d=por_conta.get(aid)
    if d is None: continue
    s=d[(d.dt<ref)&(d.dt>=ref-pd.Timedelta(days=7))]
    ant.append(s[["feature_name","error_count","is_beta_feature"]])
A=pd.concat(ant) if ant else pd.DataFrame(columns=["feature_name","error_count","is_beta_feature"])
base=fu.feature_name.value_counts(normalize=True)
pre=A.feature_name.value_counts(normalize=True)
cmp=pd.DataFrame({"share_pre_ticket_%":pre*100,"share_uso_geral_%":base*100})
cmp["dif_pp"]=cmp["share_pre_ticket_%"]-cmp["share_uso_geral_%"]
cmp["n_pre_ticket"]=A.feature_name.value_counts()
print("features com maior sobre-representacao nos 7 dias antes de um ticket (top 8):")
print(cmp.sort_values("dif_pp",ascending=False).head(8).round(3))
print("\nfeatures com maior sub-representacao (top 5):"); print(cmp.sort_values("dif_pp").head(5).round(3))
print("\nbeta: %.2f%% dos eventos nos 7d antes de ticket sao beta | %.2f%% no uso geral"%(A.is_beta_feature.mean()*100,fu.is_beta_feature.mean()*100))

print("\n========== D) ERRO POR FEATURE (feature_usage isolado) — top e bottom por taxa de erro")
ef=fu.groupby("feature_name").agg(eventos=("usage_id","size"),usos=("usage_count","sum"),erros=("error_count","sum"))
ef["taxa_erro_%"]=ef.erros/ef.usos*100
print(ef.sort_values("taxa_erro_%",ascending=False).head(5).round(3)); print(ef.sort_values("taxa_erro_%").head(3).round(3))
print("taxa de erro global: %.3f%% | beta=%.3f%% vs nao-beta=%.3f%%"%(
    fu.error_count.sum()/fu.usage_count.sum()*100,
    fu[fu.is_beta_feature].error_count.sum()/fu[fu.is_beta_feature].usage_count.sum()*100,
    fu[~fu.is_beta_feature].error_count.sum()/fu[~fu.is_beta_feature].usage_count.sum()*100))
