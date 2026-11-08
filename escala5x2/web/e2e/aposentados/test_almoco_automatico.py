# Almoço automático: muda o horário do intervalo em Horários e os almoços se ajustam sozinhos
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def hm(s): h,m=s.split(":"); return int(h)*60+int(m)
SEM="t=>[...t.querySelectorAll('button[data-alm]')].filter(b=>b.dataset.alm).map(b=>({ini:b.dataset.alm, fim:b.textContent.split('–')[1].slice(0,5), col:b.closest('td').cellIndex, fora:!!b.dataset.fora}))"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(2500)
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(5000)
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(800)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        a = await tab.evaluate(SEM)
        por = {}
        for x in a: por.setdefault(x["col"], []).append(x["ini"])
        pior = max(max(v.count(y) for y in set(v)) / len(v) for v in por.values() if v)
        check("ao abrir, os almoços já estão espalhados (sem clicar em nada)", pior <= 0.4, {k: sorted(v) for k, v in list(por.items())[:2]})
        # muda o horário do intervalo de todos os turnos para 13:00–16:00, sem gerar a escala
        await go("horarios")
        ids = await pg.eval_on_selector_all("[id^='h-win-s-']", "els=>els.map(e=>e.id.slice(8))")
        for sid in ids:
            await pg.fill(f"#h-win-s-{sid}", "13:00"); await pg.wait_for_timeout(100)
            await pg.fill(f"#h-win-e-{sid}", "17:00"); await pg.wait_for_timeout(100)
        await pg.wait_for_timeout(2500)
        await go("almoco"); await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1500)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        a = await tab.evaluate(SEM)
        dias_semana = [x for x in a if x["col"] < 7]
        fora = [x for x in a if not (hm(x["ini"]) >= 13*60 and hm(x["fim"]) <= 17*60)]
        # domingos usam o turno de domingo (sem intervalo no exemplo), então todos os almoços mostrados são de turnos normais
        check("sem gerar a escala, todos os almoços foram para 13:00–17:00", len(a) > 20 and not fora, [ (x["ini"], x["fim"]) for x in fora][:5])
        check("nenhum marcado fora do horário", not any(x["fora"] for x in a))
        por = {}
        for x in a: por.setdefault(x["col"], []).append(x["ini"])
        check("espalhados em vários horários", all(len(set(v)) >= 3 for v in por.values() if len(v) >= 5), {k: sorted(set(v)) for k, v in por.items()})
        await pg.locator("[id^=alm-semana-]").first.screenshot(path=D+"almoco_automatico.png")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
