import html, re, subprocess, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent
md = (OUT / 'RELATORIO_DIAGNOSTICO_CHURN.md').read_text(encoding='utf-8')

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', t)
    return t.replace('\\*', '*')

out, lines, i = [], md.split('\n'), 0
while i < len(lines):
    l = lines[i]
    if l.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s\-|:]+\|$', lines[i + 1]):
        cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
        out.append('<div class="tw"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in cells(l)) + '</tr></thead><tbody>')
        i += 2
        while i < len(lines) and lines[i].startswith('|'):
            out.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in cells(lines[i])) + '</tr>'); i += 1
        out.append('</tbody></table></div>'); continue
    m = re.match(r'^!\[(.*?)\]\((.*?)\)$', l)
    if m: out.append(f'<figure><img src="{m.group(2)}" alt="{html.escape(m.group(1))}"></figure>')
    elif re.match(r'^#{1,3} ', l):
        n = len(l.split(' ')[0]); out.append(f'<h{n}>{inline(l[n+1:])}</h{n}>')
    elif l.strip() == '---': out.append('<hr>')
    elif re.match(r'^\s*(\d+\.|-) ', l):
        ordered = bool(re.match(r'^\d+\.', l)); tag = 'ol' if ordered else 'ul'; items = []
        while i < len(lines) and (re.match(r'^(\d+\.|-) ', lines[i]) or (lines[i].startswith('   ') and lines[i].strip())):
            s = lines[i]
            if re.match(r'^(\d+\.|-) ', s): items.append([re.sub(r'^(\d+\.|-) ', '', s), []])
            else: items[-1][1].append(re.sub(r'^\s*(-|\d+\.) ', '', s))
            i += 1
        out.append(f'<{tag}>' + ''.join('<li>' + inline(a) + (('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in b) + '</ul>') if b else '') + '</li>' for a, b in items) + f'</{tag}>')
        continue
    elif l.strip(): out.append(f'<p>{inline(l)}</p>')
    i += 1

css = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color:#0b0b0b; font-size:10.5pt; line-height:1.45; }
h1 { font-size:22pt; margin:0 0 6px; } h2 { font-size:15pt; margin:22px 0 8px; border-bottom:2px solid #2a78d6; padding-bottom:4px; page-break-after:avoid; }
h3 { font-size:12pt; margin:16px 0 6px; page-break-after:avoid; } p { margin:6px 0; } hr { border:0; border-top:1px solid #e1e0d9; margin:14px 0; }
code { font-family: Menlo, monospace; font-size:8.6pt; background:#f0efec; padding:0 3px; border-radius:3px; }
.tw { margin:8px 0 10px; } table { border-collapse:collapse; width:100%; font-size:8.6pt; page-break-inside:auto; }
th { background:#eef3fb; text-align:left; font-weight:600; } th, td { border:1px solid #e1e0d9; padding:4px 6px; vertical-align:top; }
tr { page-break-inside:avoid; } figure { margin:10px 0; page-break-inside:avoid; } img { max-width:100%; }
ul, ol { margin:6px 0 6px 20px; padding:0; } li { margin:2px 0; } strong { font-weight:650; }
"""
doc = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diagnóstico de Churn — RavenStack</title><style>{css}</style></head><body>{"".join(out)}</body></html>'
h = OUT / 'RELATORIO_DIAGNOSTICO_CHURN.html'
h.write_text(doc, encoding='utf-8')
pdf = OUT / 'RELATORIO_DIAGNOSTICO_CHURN.pdf'
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
r = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', f'--print-to-pdf={pdf}', h.as_uri()], capture_output=True, text=True, timeout=120)
print('chrome exit', r.returncode, r.stderr[-400:])
print('pdf', pdf.exists(), pdf.stat().st_size if pdf.exists() else 0)
