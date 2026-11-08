import asyncio, re, os
from playwright.async_api import async_playwright
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D+"exp", exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width":1440,"height":1000}, accept_downloads=True); pg = await ctx.new_page()
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("atestados")
        check("estado vazio de atestados", "Nenhum atestado registrado" in await pg.inner_text("main"))
        await go("escala")
        await pg.locator("#semana").get_by_role("radio", name="Atestado").click()
        rows = pg.locator("#semana tbody tr").filter(has=pg.locator("th[scope=row]"))
        for (r,c) in [(0,1),(0,2),(0,3),(2,1),(4,5)]:
            await rows.nth(r).locator("td").nth(c).locator("button").first.click(); await pg.wait_for_timeout(120)
        sem = await pg.inner_text("#semana")
        check("Semana mostra 'Atestado'", "Atestado" in sem)
        # no Mês também
        await pg.locator("#mes-tool").get_by_role("radio", name="Atestado").click()
        cells = pg.locator("#mes tbody td button")
        await cells.nth(60).click(); await pg.wait_for_timeout(200)
        await go("atestados")
        kp = await pg.inner_text("#ft-kpis")
        n = int(re.search(r"DIAS DE ATESTADO\s+(\d+)", kp, re.I).group(1))
        check("KPI conta os dias de atestado", n >= 5, kp[:150])
        check("ocorrências agrupam dias seguidos", re.search(r"(\d+) ocorrências", kp) and int(re.search(r"(\d+) ocorrências", kp).group(1)) < n, kp[:150])
        first = await pg.locator("#ft-ranking tbody tr").first.inner_text()
        check("ranking com 1º lugar", first.strip().startswith("1º"), first[:80])
        await pg.locator("#ft-ranking tbody tr").first.locator("button").first.click(); await pg.wait_for_timeout(200)
        check("datas do atestado aparecem", await pg.locator("[aria-label^='Dias de atestado de']").count()==1)
        await pg.select_option("#ft-sector", "Padaria"); await pg.wait_for_timeout(300)
        check("filtro de setor", "Ninguém teve atestado" in await pg.inner_text("#ft-ranking"))
        await pg.select_option("#ft-sector", "all"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=D+"atestados.png", full_page=True)
        async with pg.expect_download(timeout=60000) as dl: await pg.get_by_role("button", name="Baixar ranking (Excel)").click()
        d = await dl.value
        check("Excel de atestados", d.suggested_filename.startswith("ranking-de-atestados"), d.suggested_filename)
        await go("faltas")
        check("faltas não misturam atestados", "Nenhuma falta registrada" in await pg.inner_text("main"))
        await go("personalizar")
        check("cor do atestado em Personalizar", await pg.locator("#cor-M").count()==1)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
