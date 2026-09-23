import pandas as pd, numpy as np
import stats_min as SM
pd.set_option("display.width",220); pd.set_option("display.max_columns",60)
import os
# caminho relativo: solution/cruzamento-uso-x-tickets/ -> solution/dashboards/data/
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data') + '/'
acc=pd.read_csv(B+"ravenstack_accounts.csv"); sub=pd.read_csv(B+"ravenstack_subscriptions.csv")
fu =pd.read_csv(B+"ravenstack_feature_usage.csv").drop_duplicates(subset="usage_id")
st =pd.read_csv(B+"ravenstack_support_tickets.csv"); ce=pd.read_csv(B+"ravenstack_churn_events.csv")
fu["account_id"]=fu.subscription_id.map(sub.set_index("subscription_id").account_id)
fu["dt"]=pd.to_datetime(fu.usage_date); st["dt"]=pd.to_datetime(st.submitted_at); ce["dt"]=pd.to_datetime(ce.churn_date)
FIM=pd.Timestamp("2024-12-31")

churn1=ce.groupby("account_id").dt.min()   # 1o churn_event
alvo=pd.Series(FIM,index=acc.account_id); alvo.update(churn1); alvo.name="ref"
churned=acc.account_id.isin(ce.account_id).values

def janela(dias):
    ini=alvo-pd.Timedelta(days=dias)
    f=fu.merge(alvo.rename("ref"),left_on="account_id",right_index=True)
    f=f[(f.dt<=f.ref)&(f.dt>f.ref-pd.Timedelta(days=dias))]
    t=st.merge(alvo.rename("ref"),left_on="account_id",right_index=True)
    t=t[(t.dt<=t.ref)&(t.dt>t.ref-pd.Timedelta(days=dias))]
    P=pd.DataFrame(index=acc.account_id)
    gf=f.groupby("account_id"); gt=t.groupby("account_id")
    P["uso_ev"]=gf.size(); P["uso_count"]=gf.usage_count.sum(); P["erros"]=gf.error_count.sum()
    P["dias_ativos"]=gf.dt.nunique(); P["feats"]=gf.feature_name.nunique(); P["beta_ev"]=gf.is_beta_feature.sum()
    P["tk_n"]=gt.size(); P["tk_escal"]=gt.escalation_flag.sum(); P["tk_alta_prio"]=t[t.priority.isin(["high","urgent"])].groupby("account_id").size()
    P["tk_res_h"]=gt.resolution_time_hours.mean(); P["tk_frt"]=gt.first_response_time_minutes.mean(); P["tk_sat"]=gt.satisfaction_score.mean()
    P=P.fillna({c:0 for c in ["uso_ev","uso_count","erros","dias_ativos","feats","beta_ev","tk_n","tk_escal","tk_alta_prio"]})
    P["taxa_erro"]=P.erros/P.uso_count.replace(0,np.nan)
    P["tk_por_1000_usos"]=P.tk_n/P.uso_count.replace(0,np.nan)*1000
    P["churn"]=churned
    return P

for dias in (90,180):
    P=janela(dias)
    print(f"\n================ JANELA FIXA DE {dias} DIAS ANTES DO EVENTO (churn = 1o churn_event; quem ficou = 31/12/2024)")
    print(f"contas churn={P.churn.sum()} | ficou={(~P.churn).sum()}")
    linhas=[]
    for c in ["uso_ev","uso_count","dias_ativos","feats","erros","taxa_erro","beta_ev","tk_n","tk_escal","tk_alta_prio","tk_res_h","tk_frt","tk_sat","tk_por_1000_usos"]:
        a=P.loc[~P.churn,c].dropna(); b=P.loc[P.churn,c].dropna()
        if len(a)<5 or len(b)<5: continue
        _,pv=SM.mannwhitney_p(a,b)
        linhas.append(dict(metrica=c,ficou_media=a.mean(),churn_media=b.mean(),dif_pct=(b.mean()/a.mean()-1)*100 if a.mean() else np.nan,
                           ficou_mediana=a.median(),churn_mediana=b.median(),p_mannwhitney=pv))
    print(pd.DataFrame(linhas).set_index("metrica").round(4))

# ---- proporcoes: conta sem nenhum uso / sem nenhum ticket na janela
P=janela(90)
print("\n-- proporcoes na janela de 90 dias --")
for c,lab in [("uso_ev","sem NENHUM uso"),("tk_n","sem NENHUM ticket")]:
    a=(P.loc[~P.churn,c]==0).mean(); b=(P.loc[P.churn,c]==0).mean()
    tab=np.array([[(P.loc[~P.churn,c]==0).sum(),(P.loc[~P.churn,c]>0).sum()],[(P.loc[P.churn,c]==0).sum(),(P.loc[P.churn,c]>0).sum()]])
    _,pv=SM.chi2_2x2_p(tab)
    print(f"{lab}: ficou {a*100:.1f}% | churn {b*100:.1f}% | p(qui-quadrado)={pv:.4f}")
