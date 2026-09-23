import numpy as np
from math import erfc, sqrt

def _norm_sf(z): return 0.5*erfc(abs(z)/sqrt(2))

def mannwhitney_p(a,b):
    """U de Mann-Whitney, aproximacao normal com correcao de empates. Retorna (U, p bicaudal)."""
    a=np.asarray(a,float); b=np.asarray(b,float); n1,n2=len(a),len(b)
    todos=np.concatenate([a,b]); ordem=todos.argsort(kind="mergesort"); ranks=np.empty(len(todos))
    s=todos[ordem]; i=0; emp=[]
    while i<len(s):
        j=i
        while j+1<len(s) and s[j+1]==s[i]: j+=1
        r=(i+j)/2+1; ranks[ordem[i:j+1]]=r; emp.append(j-i+1); i=j+1
    R1=ranks[:n1].sum(); U1=R1-n1*(n1+1)/2; U=min(U1,n1*n2-U1)
    mu=n1*n2/2; N=n1+n2
    corr=sum(t**3-t for t in emp)
    sd=sqrt(n1*n2/12*((N+1)-corr/(N*(N-1)))) if N>1 else 0
    if sd==0: return U,1.0
    z=(U-mu+0.5)/sd
    return U, 2*_norm_sf(z)

def chi2_2x2_p(tab):
    """Qui-quadrado 2x2 com correcao de Yates. tab=[[a,b],[c,d]]. Retorna (chi2, p)."""
    t=np.asarray(tab,float); n=t.sum()
    exp=np.outer(t.sum(1),t.sum(0))/n
    if (exp<1).any(): return np.nan, np.nan
    chi2=(( (abs(t-exp)-0.5).clip(min=0) )**2/exp).sum()
    p=erfc(sqrt(chi2/2))   # sobrevivencia da qui-quadrado com 1 grau de liberdade
    return chi2, p

def spearman(x,y):
    x=np.asarray(x,float); y=np.asarray(y,float); m=~(np.isnan(x)|np.isnan(y)); x,y=x[m],y[m]
    def rk(v):
        o=v.argsort(kind="mergesort"); r=np.empty(len(v)); s=v[o]; i=0
        while i<len(s):
            j=i
            while j+1<len(s) and s[j+1]==s[i]: j+=1
            r[o[i:j+1]]=(i+j)/2+1; i=j+1
        return r
    rx,ry=rk(x),rk(y); n=len(x)
    if n<3: return np.nan,np.nan
    rho=np.corrcoef(rx,ry)[0,1]
    if abs(rho)>=1: return rho,0.0
    t=rho*sqrt((n-2)/(1-rho**2))
    return rho, 2*_norm_sf(t)   # aproximacao normal (n grande)
