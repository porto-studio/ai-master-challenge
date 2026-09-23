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

print("========== E) LINHA DO TEMPO MENSAL (checa as 2 falas do CEO: 'uso cresceu' e 'satisfacao ok')")
fu["mes"]=fu.dt.dt.to_period("M"); st["mes"]=st.dt.dt.to_period("M"); ce["mes"]=ce.dt.dt.to_period("M")
m=pd.DataFrame({
 "uso_eventos":fu.groupby("mes").size(),
 "uso_count":fu.groupby("mes").usage_count.sum(),
 "contas_ativas_no_uso":fu.groupby("mes").account_id.nunique(),
 "erros":fu.groupby("mes").error_count.sum(),
 "tickets":st.groupby("mes").size(),
 "satisfacao_media":st.groupby("mes").satisfaction_score.mean(),
 "escalacoes":st.groupby("mes").escalation_flag.sum(),
 "churn_events":ce.groupby("mes").size()}).fillna(0)
m["uso_por_conta_ativa"]=m.uso_count/m.contas_ativas_no_uso
m["tickets_por_conta_ativa"]=m.tickets/m.contas_ativas_no_uso
m["taxa_erro_%"]=m.erros/m.uso_count*100
print(m.round(2).to_string())
print("\ncorrelacao mensal (Spearman) uso_por_conta_ativa x tickets_por_conta_ativa: rho=%.3f p=%.4f"%SM.spearman(m.uso_por_conta_ativa,m.tickets_por_conta_ativa))
print("correlacao mensal taxa_erro x tickets_por_conta_ativa: rho=%.3f p=%.4f"%SM.spearman(m["taxa_erro_%"],m.tickets_por_conta_ativa))
print("correlacao mensal tickets_por_conta_ativa x churn_events: rho=%.3f p=%.4f"%SM.spearman(m.tickets_por_conta_ativa,m.churn_events))
print("primeiros 6 meses vs ultimos 6 meses — uso_count: %.0f -> %.0f | tickets: %.0f -> %.0f | satisfacao: %.3f -> %.3f"%(
 m.uso_count[:6].sum(),m.uso_count[-6:].sum(),m.tickets[:6].sum(),m.tickets[-6:].sum(),
 st[st.dt<'2023-07-01'].satisfaction_score.mean(),st[st.dt>='2024-07-01'].satisfaction_score.mean()))

print("\n========== F) QUADRANTE uso x tickets (por conta, vida toda) x churn")
P=pd.DataFrame(index=acc.account_id)
P["uso_count"]=fu.groupby("account_id").usage_count.sum()
P["erros"]=fu.groupby("account_id").error_count.sum()
P["tk_n"]=st.groupby("account_id").size().reindex(acc.account_id).fillna(0)
P["tk_sat"]=st.groupby("account_id").satisfaction_score.mean()
P["tk_escal"]=st.groupby("account_id").escalation_flag.sum().reindex(acc.account_id).fillna(0)
ult=sub.sort_values("start_dt").groupby("account_id").tail(1).set_index("account_id")
P["mrr"]=ult.mrr_amount; P["plan"]=ult.plan_tier
P["D1"]=acc.set_index("account_id").churn_flag.reindex(P.index).astype(bool)
P["D2"]=P.index.isin(set(ce.account_id)); P["D3"]=ult.end_dt.notna().reindex(P.index).fillna(False)
P["uso_baixo"]=P.uso_count<=P.uso_count.median(); P["tk_alto"]=P.tk_n>P.tk_n.median()
q=P.groupby(["uso_baixo","tk_alto"]).agg(contas=("mrr","size"),churn_D1_pct=("D1","mean"),churn_D2_pct=("D2","mean"),
      churn_D3_pct=("D3","mean"),mrr_medio=("mrr","mean"),uso_medio=("uso_count","mean"),tickets_medios=("tk_n","mean"))
q[["churn_D1_pct","churn_D2_pct","churn_D3_pct"]]*=100
print(q.round(2))
alvo=P.uso_baixo&P.tk_alto
tab=[[(~alvo&P.D1).sum(),(~alvo&~P.D1).sum()],[(alvo&P.D1).sum(),(alvo&~P.D1).sum()]]
print("quadrante 'uso baixo + muitos tickets' vs resto, churn D1: p(qui-quadrado)=%.4f"%SM.chi2_2x2_p(tab)[1])

print("\n========== G) PODER DE SEPARACAO (AUC) de cada variavel de uso/suporte para prever churn")
def auc(x,y):
    x=np.asarray(x,float); y=np.asarray(y,bool); m=~np.isnan(x); x,y=x[m],y[m]
    a,b=x[~y],x[y]
    if len(a)<5 or len(b)<5: return np.nan,np.nan
    U,p=SM.mannwhitney_p(a,b)
    # U devolvido e o menor; reconstroi AUC pelo rank do grupo churn
    r=pd.Series(x).rank().values; Rb=r[y].sum(); Ub=Rb-len(b)*(len(b)+1)/2
    return Ub/(len(a)*len(b)), p
linhas=[]
for c in ["uso_count","erros","tk_n","tk_sat","tk_escal"]:
    for d in ["D1","D2","D3"]:
        a,p=auc(P[c],P[d]); linhas.append(dict(variavel=c,definicao=d,AUC=a,p=p))
print(pd.DataFrame(linhas).pivot(index="variavel",columns="definicao",values=["AUC","p"]).round(3))
print("(AUC 0,50 = mesmo poder de separacao que jogar moeda)")

print("\n========== H) MESMO CRUZAMENTO DENTRO DE CADA SEGMENTO (plano / canal / trial)")
acc2=acc.set_index("account_id")
P["plan_inicial"]=acc2.plan_tier; P["canal"]=acc2.referral_source; P["trial"]=acc2.is_trial; P["industria"]=acc2.industry
for seg in ["plan_inicial","canal","trial","industria"]:
    r=P.groupby(seg).agg(contas=("mrr","size"),uso_medio=("uso_count","mean"),erros_medios=("erros","mean"),
        tickets_medios=("tk_n","mean"),satisfacao=("tk_sat","mean"),escal_medias=("tk_escal","mean"),
        churn_D1_pct=("D1","mean"),churn_D2_pct=("D2","mean"))
    r[["churn_D1_pct","churn_D2_pct"]]*=100
    print(f"\n--- por {seg} ---"); print(r.round(2))
