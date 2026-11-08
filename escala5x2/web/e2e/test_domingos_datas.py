# Domingos: navegar pelas datas (‹ ›, Ir para), como na Semana
import asyncio, os, re, datetime as dt
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def iso(s): return dt.date.fromisoformat(s)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#domingos"); await pg.wait_for_timeout(4000)
        rng = pg.locator("[id^=dom-range-]").first
        date = pg.locator("[id^=dom-date-]").first
        check("barra de datas aparece", await rng.count() == 1 and await date.count() == 1)
        r0 = await rng.inner_text(); d0 = await date.input_value()
        check("começa num domingo", iso(d0).weekday() == 6, d0)
        heads0 = await pg.eval_on_selector_all("table thead th", "t=>t.map(x=>x.textContent).filter(x=>/Dom \\d/.test(x))")
        n = len(heads0)
        await pg.locator("[id^=dom-next-]").first.click(); await pg.wait_for_timeout(1500)
        d1 = await date.input_value()
        check("› mostra os próximos domingos", (iso(d1)-iso(d0)).days == 7*n, (d0,d1,n))
        heads1 = await pg.eval_on_selector_all("table thead th", "t=>t.map(x=>x.textContent).filter(x=>/Dom \\d/.test(x))")
        check("colunas mudaram", heads1 and heads1 != heads0, heads1[:2])
        await pg.locator("[id^=dom-prev-]").first.click(); await pg.wait_for_timeout(1500)
        check("‹ volta", await date.input_value() == d0)
        # Ir para uma data dentro: nada muda
        inside = (iso(d0)+dt.timedelta(days=10)).isoformat()
        await date.fill(inside); await pg.wait_for_timeout(800)
        check("data dentro do período não muda", await date.input_value() == d0)
        # Ir para 22/12/2026 (terça): os domingos começam em 27/12
        await date.fill("2026-12-22"); await pg.wait_for_timeout(1500)
        check("Ir para fora do período", await date.input_value() == "2026-12-27", await date.input_value())
        check("faixa de datas atualizada", (await rng.inner_text()).startswith("Dom 27/12"), await rng.inner_text())
        # a Escala acompanha (mesmo período)
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(2500)
        sub = await pg.inner_text("main")
        check("Escala com o mesmo período", "planejamento de 21/12/2026" in sub, re.findall(r"planejamento de [\d/]+ a [\d/]+", sub)[:1])
        await pg.goto(URL + "#domingos"); await pg.wait_for_timeout(2500)
        await pg.locator("[id^=dom-range-]").first.scroll_into_view_if_needed()
        await pg.screenshot(path=D+"domingos_datas.png")
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(500)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
