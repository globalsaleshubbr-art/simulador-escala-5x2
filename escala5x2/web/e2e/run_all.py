"""Roda todos os testes de navegador (Playwright) sobre dist/simples-local.html.

Uso:
    cd web
    node scripts/build-standalone.mjs        # gera dist/simples-local.html
    python3 e2e/run_all.py                   # roda tudo e mostra o resumo

Requer: pip install playwright && python3 -m playwright install chromium
Para testar outro endereço: ESCALA_URL=file:///caminho/simples-local.html python3 e2e/run_all.py
Capturas de tela e arquivos baixados ficam em e2e/saida/.
"""
import glob, os, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
falhou = []
for f in sorted(glob.glob(os.path.join(here, "test_*.py"))):
    nome = os.path.basename(f)
    print(f"\n== {nome}")
    r = subprocess.run([sys.executable, f], capture_output=True, text=True, timeout=600)
    linhas = [l for l in r.stdout.splitlines() if l.startswith(("OK", "FALHAS", " ✗", "errors", "Baixar", "Excel", "Escala", "mes"))]
    print("\n".join(linhas) or r.stdout[-800:])
    # testes que não devolvem código de erro também contam como falha quando mostram "FALHAS N" com N > 0
    falhas_txt = any(l.startswith("FALHAS") and l.split()[1:2] != ["0"] for l in r.stdout.splitlines())
    if r.returncode != 0 or falhas_txt:
        falhou.append(nome)
        print(r.stderr[-1500:])
print("\nResumo:", "tudo passou" if not falhou else f"falharam: {', '.join(falhou)}")
sys.exit(1 if falhou else 0)
