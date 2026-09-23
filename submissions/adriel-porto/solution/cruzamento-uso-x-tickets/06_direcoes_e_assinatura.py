import pandas as pd, numpy as np, stats_min as SM
pd.set_option("display.width",240); pd.set_option("display.max_columns",60)
import os
# caminho relativo: solution/cruzamento-uso-x-tickets/ -> solution/dashboards/data/
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data') + '/'
acc=pd.read_csv(B+"ravenstack_accounts.csv"); sub=pd.read_csv(B+"ravenstack_subscriptions.csv")
fu =pd.read_csv(B+"ravenstack_feature_usage.csv").drop_duplicates(subset="usage_id")
st =pd.read_csv(B+"ravenstack_support_tickets.csv"); ce=pd.read_csv(B+"ravenstack_churn_events.csv")
fu["account_id"]=fu.subscription_id.map(sub.set_index("subscription_id").account_id)
fu["dt"]=pd.to_datetime(fu.usage_date); st["dt"]=pd.to_datetime(st.submitted_at); ce["dt"]=pd.to_datetime(ce.churn_date)
sub["start_dt"]=pd.to_datetime(sub.start_date); sub["end_dt"]=pd.to_datetime(sub.end_date,errors="coerce")
porconta={k:v for k,v in fu.groupby("account_id")}

print("========== I) O TICKET DERRUBA O USO DEPOIS? (30 dias antes x 30 dias depois de cada ticket)")
ant=[];dep=[]
for aid,ref in zip(st.account_id,st.dt):
    d=porconta.get(aid)
    if d is None: ant.append(0);dep.append(0); continue
    ant.append(d[(d.dt<ref)&(d.dt>=ref-pd.Timedelta(days=30))].usage_count.sum())
    dep.append(d[(d.dt>ref)&(d.dt<=ref+pd.Timedelta(days=30))].usage_count.sum())
A=pd.Series(ant,dtype=float); D=pd.Series(dep,dtype=float)
print(f"uso medio 30d antes={A.mean():.2f} | 30d depois={D.mean():.2f} | variacao={(D.mean()/A.mean()-1)*100:+.1f}% | p(Mann-Whitney)={SM.mannwhitney_p(A,D)[1]:.4f}")
for lab,msk in [("escalados",st.escalation_flag.values.astype(bool)),
                ("satisfacao 1-2",(st.satisfaction_score<=2).fillna(False).values),
                ("resolucao > 48h",(st.resolution_time_hours>48).values)]:
    a,d2=A[msk],D[msk]
    print(f"  {lab} (n={msk.sum()}): antes={a.mean():.2f} depois={d2.mean():.2f} ({(d2.mean()/a.mean()-1)*100:+.1f}%) p={SM.mannwhitney_p(a,d2)[1]:.4f}")

print("\n========== J) O TICKET RUIM ANTECEDE CHURN? (houve churn_event na conta ate 90 dias depois do ticket?)")
ch={k:v.dt.sort_values().values for k,v in ce.groupby("account_id")}
def churn_em(aid,ref,dias):
    v=ch.get(aid)
    if v is None: return False
    return bool(((v>ref)&(v<=ref+np.timedelta64(dias,'D'))).any())
st["churn_90d"]=[churn_em(a,r,90) for a,r in zip(st.account_id,st.dt)]
st["churn_30d"]=[churn_em(a,r,30) for a,r in zip(st.account_id,st.dt)]
base90=st.churn_90d.mean()*100
print(f"base: {base90:.1f}% dos 2.000 tickets sao seguidos de churn_event em 90 dias\n")
def comp(lab,msk):
    a=st.loc[~msk,"churn_90d"]; b=st.loc[msk,"churn_90d"]
    tab=[[(~a).sum(),a.sum()],[(~b).sum(),b.sum()]]
    p=SM.chi2_2x2_p(tab)[1]
    print(f"{lab:26s} n={msk.sum():5d} | churn 90d: {b.mean()*100:5.1f}% vs {a.mean()*100:5.1f}% nos demais | p={p if p==p else float('nan'):.4f}")
comp("escalado",st.escalation_flag.astype(bool))
comp("prioridade high/urgent",st.priority.isin(["high","urgent"]))
comp("satisfacao 1-2",(st.satisfaction_score<=2).fillna(False))
comp("satisfacao 4-5",(st.satisfaction_score>=4).fillna(False))
comp("satisfacao nao respondida",st.satisfaction_score.isna())
comp("resolucao > 48h",st.resolution_time_hours>48)
comp("1a resposta > 120 min",st.first_response_time_minutes>120)
print("\nmedias por ticket seguido ou nao de churn em 90d:")
print(st.groupby("churn_90d").agg(n=("ticket_id","size"),resolucao_h=("resolution_time_hours","mean"),
     frt_min=("first_response_time_minutes","mean"),satisfacao=("satisfaction_score","mean"),
     escalacao=("escalation_flag","mean")).round(3))

print("\n========== K) NIVEL ASSINATURA: uso da assinatura que terminou x uso da que continuou")
u=fu.groupby("subscription_id").agg(uso_ev=("usage_id","size"),uso_count=("usage_count","sum"),
    erros=("error_count","sum"),dias=("dt","nunique"),ult=("dt","max"),beta=("is_beta_feature","sum"))
S=sub.set_index("subscription_id").join(u)
S["dur_dias"]=((S.end_dt.fillna(pd.Timestamp("2024-12-31"))-S.start_dt).dt.days).clip(lower=1)
S["uso_por_30d"]=S.uso_count.fillna(0)/S.dur_dias*30
S["taxa_erro"]=S.erros/S.uso_count
S["terminou"]=S.churn_flag.astype(bool)
cols=["uso_ev","uso_count","erros","taxa_erro","dias","beta","uso_por_30d","dur_dias","mrr_amount","seats"]
r=S.groupby("terminou")[cols].mean().T; r.columns=[f"ativa(n={(~S.terminou).sum()})",f"encerrada(n={S.terminou.sum()})"]
r["dif_%"]=(r.iloc[:,1]/r.iloc[:,0]-1)*100
r["p_MannWhitney"]=[SM.mannwhitney_p(S.loc[~S.terminou,c].dropna(),S.loc[S.terminou,c].dropna())[1] for c in cols]
print(r.round(4))
print("\nassinaturas sem NENHUM registro de uso: %d (ativas %d / encerradas %d)"%(
 S.uso_ev.isna().sum(),S.loc[~S.terminou,"uso_ev"].isna().sum(),S.loc[S.terminou,"uso_ev"].isna().sum()))
print("upgrade_flag: ativa %.1f%% x encerrada %.1f%% | downgrade_flag: %.1f%% x %.1f%% | auto_renew: %.1f%% x %.1f%%"%(
 S.loc[~S.terminou,"upgrade_flag"].mean()*100,S.loc[S.terminou,"upgrade_flag"].mean()*100,
 S.loc[~S.terminou,"downgrade_flag"].mean()*100,S.loc[S.terminou,"downgrade_flag"].mean()*100,
 S.loc[~S.terminou,"auto_renew_flag"].mean()*100,S.loc[S.terminou,"auto_renew_flag"].mean()*100))
