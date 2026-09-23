import pandas as pd, numpy as np
pd.set_option("display.width",200); pd.set_option("display.max_columns",50)
import os
# caminho relativo: solution/cruzamento-uso-x-tickets/ -> solution/dashboards/data/
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data') + '/'
acc=pd.read_csv(B+"ravenstack_accounts.csv"); sub=pd.read_csv(B+"ravenstack_subscriptions.csv")
fu =pd.read_csv(B+"ravenstack_feature_usage.csv"); st=pd.read_csv(B+"ravenstack_support_tickets.csv")
ce =pd.read_csv(B+"ravenstack_churn_events.csv")

fu=fu.drop_duplicates(subset="usage_id")                      # 21 usage_id duplicados
fu["account_id"]=fu.subscription_id.map(sub.set_index("subscription_id").account_id)
fu["dt"]=pd.to_datetime(fu.usage_date); st["dt"]=pd.to_datetime(st.submitted_at); ce["dt"]=pd.to_datetime(ce.churn_date)
sub["start_dt"]=pd.to_datetime(sub.start_date); sub["end_dt"]=pd.to_datetime(sub.end_date,errors="coerce")
FIM=pd.Timestamp("2024-12-31")

# ---- definicoes de churn
d1=set(acc.loc[acc.churn_flag==True,"account_id"]); d2=set(ce.account_id)
ult=sub.sort_values("start_dt").groupby("account_id").tail(1); d3=set(ult.loc[ult.end_dt.notna(),"account_id"])
corte=ce.groupby("account_id").dt.min()          # 1o churn_event por conta

P=acc[["account_id","plan_tier","industry","referral_source","is_trial","seats"]].copy().set_index("account_id")
P["corte"]=P.index.map(corte).fillna(FIM)        # janela observada termina no 1o churn (ou no fim do dataset)
P["inicio"]=P.index.map(sub.groupby("account_id").start_dt.min())
P["dias_obs"]=(P.corte-P.inicio).dt.days.clip(lower=1)
P["mrr_ult"]=P.index.map(ult.set_index("account_id").mrr_amount)

# ---- metricas de feature_usage (so ate o corte)
f=fu.merge(P[["corte"]],left_on="account_id",right_index=True); f=f[f.dt<=f.corte]
g=f.groupby("account_id")
P["uso_eventos"]=g.size(); P["uso_count"]=g.usage_count.sum(); P["uso_seg"]=g.usage_duration_secs.sum()
P["uso_erros"]=g.error_count.sum(); P["uso_dias_ativos"]=g.dt.nunique(); P["uso_features_distintas"]=g.feature_name.nunique()
P["uso_ultimo"]=g.dt.max(); P["uso_beta_ev"]=f.groupby("account_id").is_beta_feature.sum()
P[["uso_eventos","uso_count","uso_seg","uso_erros","uso_dias_ativos","uso_features_distintas","uso_beta_ev"]]=P[["uso_eventos","uso_count","uso_seg","uso_erros","uso_dias_ativos","uso_features_distintas","uso_beta_ev"]].fillna(0)
P["taxa_erro"]=P.uso_erros/P.uso_count.replace(0,np.nan)
P["uso_por_100d"]=P.uso_eventos/P.dias_obs*100
P["dias_desde_ultimo_uso"]=(P.corte-P.uso_ultimo).dt.days

# ---- metricas de support_tickets (so ate o corte)
t=st.merge(P[["corte"]],left_on="account_id",right_index=True); t=t[t.dt<=t.corte]
h=t.groupby("account_id")
P["tk_n"]=h.size(); P["tk_escal"]=h.escalation_flag.sum(); P["tk_res_h"]=h.resolution_time_hours.mean()
P["tk_frt_min"]=h.first_response_time_minutes.mean(); P["tk_sat"]=h.satisfaction_score.mean()
P["tk_sat_resp"]=h.satisfaction_score.count(); P["tk_urg_high"]=t[t.priority.isin(["high","urgent"])].groupby("account_id").size()
P[["tk_n","tk_escal","tk_urg_high","tk_sat_resp"]]=P[["tk_n","tk_escal","tk_urg_high","tk_sat_resp"]].fillna(0)
P["tk_por_100d"]=P.tk_n/P.dias_obs*100
P["tk_por_1000_usos"]=P.tk_n/P.uso_count.replace(0,np.nan)*1000

for nome,s in [("D1_churn_flag",d1),("D2_churn_event",d2),("D3_ult_assin_encerrada",d3)]:
    P[nome]=P.index.isin(s)

P.to_csv("painel_conta.csv")

cols=["uso_eventos","uso_count","uso_dias_ativos","uso_por_100d","uso_features_distintas","taxa_erro","uso_erros",
      "dias_desde_ultimo_uso","tk_n","tk_por_100d","tk_por_1000_usos","tk_escal","tk_res_h","tk_frt_min","tk_sat","dias_obs"]
print("### MEDIA por conta — churn vs nao-churn, nas 3 definicoes\n")
for nome in ["D1_churn_flag","D2_churn_event","D3_ult_assin_encerrada"]:
    r=P.groupby(nome)[cols].mean().T
    r.columns=[f"ficou(n={(~P[nome]).sum()})",f"churn(n={P[nome].sum()})"]
    r["dif_%"]=(r.iloc[:,1]/r.iloc[:,0]-1)*100
    print(f"--- {nome} ---"); print(r.round(3)); print()

print("### MEDIANA (mesmas colunas), definicao D2")
r=P.groupby("D2_churn_event")[cols].median().T; r.columns=["ficou","churn"]; r["dif_%"]=(r.iloc[:,1]/r.iloc[:,0]-1)*100
print(r.round(3))
