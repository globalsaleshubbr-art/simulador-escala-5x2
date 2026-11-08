# Semana e Mês abrem ordenados pelo horário de entrada
import asyncio, os
from playwright.async_api import async_playwright
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def hm(s): h,m=s.split(":"); return int(h)*60+int(m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(4000)
        sel = pg.locator("#semana select").filter(has=pg.locator("option", has_text="Horário de entrada")).first
        check("Semana abre em 'Horário de entrada'", await sel.input_value() == "entrada", await sel.input_value())
        check("crescente", await pg.get_attribute("#semana [role=radiogroup] [aria-checked=true]", "aria-checked") == "true")
        turnos = await pg.evaluate("[...document.querySelectorAll('#semana table tbody tr th[scope=row] span.block')].map(s=>s.textContent.split(' · ')[0])")
        ordem_turnos = []
        for t in turnos:
            if not ordem_turnos or ordem_turnos[-1] != t: ordem_turnos.append(t)
        check("pessoas agrupadas por turno (cada turno num bloco)", len(ordem_turnos) == len(set(ordem_turnos)), ordem_turnos)
        msel = pg.locator("select").filter(has=pg.locator("option", has_text="Turno (horário de entrada)")).first
        check("Mês abre em 'Turno (horário de entrada)'", await msel.input_value() == "turno", await msel.input_value())
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
