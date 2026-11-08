# Regras avançadas 8b: quando uma pessoa folga, a pessoa escolhida vai para o turno dela naquele dia.
import asyncio, os, re
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(1800)
        await pg.goto(URL + "#regras"); await pg.wait_for_timeout(5000)
        await pg.wait_for_timeout(300)
        linha = await pg.inner_text("#ra-cobre-linha")
        check("regra 8b aparece", "Quem cobre a folga de quem" in linha and "vai para o turno dela" in linha, linha[:200])
        opts = await pg.eval_on_selector("#ra-cobre-a", "s=>[...s.options].map(o=>[o.value,o.textContent])")
        fc = [o for o in opts if "Frente de Caixa" in o[1]]
        a = fc[0]
        turnoA = re.search(r"\(([^)]+)\)$", a[1]).group(1)
        await pg.select_option("#ra-cobre-a", a[0]); await pg.wait_for_timeout(200)
        optsb = await pg.eval_on_selector("#ra-cobre-b", "s=>[...s.options].map(o=>[o.value,o.textContent])")
        check("substituto: só gente do mesmo setor", all("Frente de Caixa" in o[1] for o in optsb if o[0]) and a[0] not in [o[0] for o in optsb])
        bb = [o for o in optsb if o[0] and f"({turnoA})" not in o[1]][0]
        await pg.select_option("#ra-cobre-b", bb[0]); await pg.click("#ra-cobre-add"); await pg.wait_for_timeout(600)
        chip = " ".join((await pg.inner_text("#ra-cobre")).split())
        nomeA = a[1].split(" · ")[0]; nomeB = bb[1].split(" · ")[0]
        check("dupla aparece: 'Quando A folga, B vai para o turno dela'", f"Quando {nomeA} folga, {nomeB} vai para o turno dela" in chip, chip[:200])
        check("opção: também férias/falta/atestado", await pg.locator("#ra-cobre-ausencias").count() == 1)
        await pg.locator("#ra-cobre-linha").screenshot(path=D + "cobrir_folga.png")
        # gerar a escala
        await go("escala")
        await pg.get_by_role("button", name="Gerar escala", exact=True).click()
        await pg.wait_for_function("()=>![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Gerando…')", timeout=120000); await pg.wait_for_timeout(2500)
        rel = await pg.locator("div[role=status].rounded-2xl").first.inner_text()
        check("relatório conta a cobertura de folga", "Cobertura de folga" in rel, rel[:400])
        async def celulas(nome):
            return await pg.eval_on_selector_all(f"#semana button[aria-label^='{nome},']", "bs=>bs.map(b=>[b.getAttribute('aria-label'), b.getAttribute('title')||''])")
        async def confere():
            ca = await celulas(nomeA); cb = await celulas(nomeB)
            casos = [(x, y) for x, y in zip(ca, cb) if ": Folga" in x[0] and y[1] and "domingo" not in x[0].lower()]
            return casos, all(y[1].startswith(turnoA) for _, y in casos)
        semanas_ok = 0; total = 0
        for _ in range(3):
            casos, bom = await confere()
            total += len(casos)
            if casos and bom: semanas_ok += 1
            if casos and not bom: check("folga do titular: substituto no turno dele", False, casos[:2])
            await pg.get_by_role("button", name="Próxima semana").first.click(); await pg.wait_for_timeout(700)
        check("na folga do titular, o substituto fica no turno dele", total > 0 and semanas_ok > 0, total)
        # vale na hora: lança uma folga à mão no titular num dia em que os dois trabalham
        for _ in range(3): await pg.get_by_role("button", name="Semana anterior").first.click(); await pg.wait_for_timeout(500)
        ca = await celulas(nomeA); cb = await celulas(nomeB)
        k = next(i for i, (x, y) in enumerate(zip(ca, cb)) if ": Folga" not in x[0] and y[1] and ": Folga" not in y[0] and "domingo" not in x[0].lower() and "sábado" not in x[0].lower())
        await pg.locator(f"#semana button[aria-label^='{nomeA},']").nth(k).click(); await pg.wait_for_timeout(2000)
        cb2 = await celulas(nomeB)
        check("folga lançada à mão: o substituto vai para o turno na hora", cb2[k][1].startswith(turnoA), (cb[k][1], cb2[k][1]))
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(5000); await go("escala")
        for _ in range(0): pass
        cb3 = await celulas(nomeB)
        check("gravado após recarregar", cb3[k][1].startswith(turnoA), cb3[k][1])
        # desfaz a folga à mão: o substituto volta ao turno dele
        await pg.locator(f"#semana button[aria-label^='{nomeA},']").nth(k).click(); await pg.wait_for_timeout(2000)
        cb4 = await celulas(nomeB)
        check("titular volta a trabalhar: o substituto volta ao turno dele", not cb4[k][1].startswith(turnoA), cb4[k][1])
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
