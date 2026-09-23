import pandas as pd, numpy as np
import os
# caminho relativo: solution/cruzamento-uso-x-tickets/ -> solution/dashboards/data/
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dashboards', 'data') + '/'
acc=pd.read_csv(B+"ravenstack_accounts.csv")
sub=pd.read_csv(B+"ravenstack_subscriptions.csv")
fu =pd.read_csv(B+"ravenstack_feature_usage.csv")
st =pd.read_csv(B+"ravenstack_support_tickets.csv")
ce =pd.read_csv(B+"ravenstack_churn_events.csv")

print("linhas:",{k:len(v) for k,v in dict(accounts=acc,subscriptions=sub,feature_usage=fu,support_tickets=st,churn_events=ce).items()})
print("\n-- chaves / orfaos --")
print("feature_usage.subscription_id sem par em subscriptions:", (~fu.subscription_id.isin(sub.subscription_id)).sum())
print("support_tickets.account_id sem par em accounts:", (~st.account_id.isin(acc.account_id)).sum())
print("subscriptions.account_id sem par em accounts:", (~sub.account_id.isin(acc.account_id)).sum())
print("churn_events.account_id sem par em accounts:", (~ce.account_id.isin(acc.account_id)).sum())
print("subscription_id duplicado em subscriptions:", sub.subscription_id.duplicated().sum())
print("usage_id duplicado:", fu.usage_id.duplicated().sum(), "| ticket_id duplicado:", st.ticket_id.duplicated().sum())

print("\n-- cobertura por conta --")
sub_acc = sub.set_index("subscription_id").account_id
fu["account_id"]=fu.subscription_id.map(sub_acc)
print("contas totais:", acc.account_id.nunique())
print("contas com >=1 uso (feature_usage):", fu.account_id.nunique())
print("contas com >=1 ticket:", st.account_id.nunique())
print("contas com uso E ticket:", len(set(fu.account_id)&set(st.account_id)))
print("contas SEM nenhum uso:", acc.account_id.nunique()-fu.account_id.nunique())
print("contas SEM nenhum ticket:", acc.account_id.nunique()-st.account_id.nunique())
print("assinaturas com >=1 uso:", fu.subscription_id.nunique(), "de", sub.subscription_id.nunique())

print("\n-- janelas de data --")
for nome,s in [("feature_usage.usage_date",fu.usage_date),("support_tickets.submitted_at",st.submitted_at),
               ("subscriptions.start_date",sub.start_date),("subscriptions.end_date",sub.end_date),
               ("churn_events.churn_date",ce.churn_date)]:
    d=pd.to_datetime(s,errors="coerce")
    print(f"{nome}: min={d.min()} max={d.max()} nulos={d.isna().sum()}")

print("\n-- nulos relevantes --")
print("support_tickets.satisfaction_score nulos:", st.satisfaction_score.isna().sum(), f"({st.satisfaction_score.isna().mean()*100:.1f}%)")
print("support_tickets.closed_at nulos:", st.closed_at.isna().sum())
print("support_tickets.resolution_time_hours nulos:", st.resolution_time_hours.isna().sum())
print("feature_usage nulos por coluna:\n", fu.isna().sum())

print("\n-- definicoes de churn --")
d1=set(acc.loc[acc.churn_flag==True,"account_id"])
d2=set(ce.account_id)
sub["end_dt"]=pd.to_datetime(sub.end_date,errors="coerce"); sub["start_dt"]=pd.to_datetime(sub.start_date,errors="coerce")
ult=sub.sort_values("start_dt").groupby("account_id").tail(1)
d3=set(ult.loc[ult.end_dt.notna(),"account_id"])
print("D1 accounts.churn_flag=True:",len(d1))
print("D2 tem >=1 churn_event:",len(d2))
print("D3 assinatura mais recente ja terminou:",len(d3))
print("D1&D2:",len(d1&d2),"| D1&D3:",len(d1&d3),"| D2&D3:",len(d2&d3),"| D1&D2&D3:",len(d1&d2&d3))
