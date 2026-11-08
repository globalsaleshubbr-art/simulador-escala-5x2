# Semana: linha grossa preta entre pessoas de turnos diferentes
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
ROWS="""[...document.querySelectorAll('#semana table tbody tr')].filter(r=>r.querySelector('th[scope=row]') && r.querySelectorAll('td').length>3).map(r=>({turno:r.querySelector('th[scope=row] span.block')?.textContent.split(' · ')[0]||'', div:!!r.dataset.novoTurno, bw:getComputedStyle(r.querySelector('th[scope=row]')).borderTopWidth, bc:getComputedStyle(r.querySelector('td')).borderTopColor, bwd:getComputedStyle(r.querySelector('td')).borderTopWidth}))"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(4000)
        # ordenar por entrada (agrupa os turnos)
        sel = pg.locator("select").filter(has=pg.locator("option", has_text="Horário de entrada")).first
        await sel.select_option(label="Horário de entrada"); await pg.wait_for_timeout(600)
        rows = await pg.evaluate(ROWS)
        rows = [r for r in rows if r["turno"]]
        check("tabela da semana lida", len(rows) >= 5, len(rows))
        mudancas = [i for i in range(1, len(rows)) if rows[i]["turno"] != rows[i-1]["turno"]]
        check("há troca de turno", len(mudancas) >= 1, [r["turno"] for r in rows])
        check("linha grossa em toda troca de turno", all(rows[i]["div"] and rows[i]["bw"] == "3px" and rows[i]["bwd"] == "3px" for i in mudancas), [(rows[i]["turno"], rows[i]["bw"]) for i in mudancas])
        check("linha preta", all(rows[i]["bc"] == "rgb(0, 0, 0)" for i in mudancas), {rows[i]["bc"] for i in mudancas})
        check("sem linha grossa no mesmo turno", not any(rows[i]["div"] for i in range(1, len(rows)) if i not in mudancas))
        check("opção marcada por padrão", await pg.is_checked("#sem-linha-turno"))
        await pg.uncheck("#sem-linha-turno"); await pg.wait_for_timeout(500)
        r2 = [r for r in await pg.evaluate(ROWS) if r["turno"]]
        check("desmarcada: sem linha grossa", not any(r["div"] for r in r2) and all(r["bw"] != "3px" for r in r2))
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        check("escolha gravada", not await pg.is_checked("#sem-linha-turno"))
        await pg.check("#sem-linha-turno"); await pg.wait_for_timeout(500)
        await sel.select_option(label="Horário de entrada"); await pg.wait_for_timeout(600)
        r3 = [r for r in await pg.evaluate(ROWS) if r["turno"]]
        check("marcada de novo: linhas voltam", any(r["div"] for r in r3))
        tbl = pg.locator("#semana table")
        await tbl.scroll_into_view_if_needed(); await tbl.screenshot(path=D+"semana_divisao_turno.png")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
