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
        await go("faltas")
        check("estado vazio explica como lançar", "Nenhuma falta registrada" in await pg.inner_text("main"))
        # lançar faltas em 3 semanas
        await go("escala")
        await pg.locator("#semana").get_by_role("radio", name="Falta").click()
        picks = [(0,1),(0,5),(1,1),(2,2),(3,1),(0,2),(5,3),(7,1),(7,5),(9,4)]
        for w in range(3):
            for (r,c) in picks[w*3: w*3+4]:
                cell = pg.locator("#semana tbody tr").filter(has=pg.locator("th[scope=row]")).nth(r).locator("td").nth(c).locator("button")
                if await cell.count(): await cell.first.click(); await pg.wait_for_timeout(120)
            await pg.get_by_role("button", name="Próxima semana").click(); await pg.wait_for_timeout(300)
        await go("faltas")
        kp = await pg.inner_text("#ft-kpis")
        n = int(re.search(r"FALTAS\s+(\d+)", kp, re.I).group(1))
        check("KPI conta as faltas lançadas", n >= 8, kp[:120])
        rows = await pg.locator("#ft-ranking tbody tr").count()
        check("ranking com pessoas", rows >= 5, rows)
        first = await pg.locator("#ft-ranking tbody tr").first.inner_text()
        check("1º lugar no topo", first.strip().startswith("1º"), first[:60])
        await pg.screenshot(path=D+"ft_full.png", full_page=True)
        # expandir datas
        await pg.locator("#ft-ranking tbody tr").first.locator("button").first.click(); await pg.wait_for_timeout(200)
        check("datas da pessoa aparecem", await pg.locator("[aria-label^='Datas das faltas']").count()==1)
        # ordenar por taxa
        await pg.locator("#ft-ranking th button", has_text="Taxa").click(); await pg.wait_for_timeout(200)
        # filtros
        await pg.select_option("#ft-wd", "1"); await pg.wait_for_timeout(300)
        wd = await pg.inner_text("#ft-weekday")
        await pg.select_option("#ft-wd", "-1")
        opts = await pg.eval_on_selector("#ft-shift", "s=>[...s.options].map(o=>o.value)")
        await pg.select_option("#ft-shift", opts[1]); await pg.wait_for_timeout(300)
        sub = await pg.locator("#ft-ranking tbody tr td:nth-child(2) span.block").all_inner_texts()
        check("filtro de turno", all(opts[1] in s for s in sub), (opts[1], sub[:3]))
        await pg.select_option("#ft-shift", "all")
        await pg.select_option("#ft-sector", "Padaria"); await pg.wait_for_timeout(300)
        check("filtro de setor sem faltas", "Ninguém faltou" in await pg.inner_text("#ft-ranking"))
        await pg.select_option("#ft-sector", "all")
        await pg.select_option("#ft-group", "turno"); await pg.wait_for_timeout(200)
        await pg.select_option("#ft-period", "custom"); await pg.wait_for_timeout(200)
        check("período personalizado mostra datas", await pg.is_visible("#ft-from"))
        await pg.select_option("#ft-period", "tudo")
        # excel
        async with pg.expect_download(timeout=60000) as dl: await pg.get_by_role("button", name="Baixar ranking (Excel)").click()
        d = await dl.value; f = D+"exp/"+d.suggested_filename; await d.save_as(f)
        check("Excel do ranking", os.path.getsize(f) > 4000, os.path.getsize(f))
        # duas lojas
        await go("lojas"); await pg.fill("#ns-names", "Loja 2"); await pg.click("#ns-create"); await pg.wait_for_timeout(600); await go("personalizar"); await pg.wait_for_timeout(500)
        await pg.click("#store-filter"); await pg.get_by_role("button", name="Selecionar todas").click(); await pg.keyboard.press("Escape")
        await go("faltas")
        check("filtro de loja com 2 lojas", await pg.is_visible("#ft-store"))
        await pg.select_option("#ft-group", "loja"); await pg.wait_for_timeout(200)
        g = await pg.inner_text("#ft-groups")
        check("agrupar por loja", "Loja 1" in g, g[:120])
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(300)
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        check("celular sem rolagem lateral", sw <= 392, sw)
        await pg.screenshot(path=D+"ft_mobile.png", full_page=False)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
