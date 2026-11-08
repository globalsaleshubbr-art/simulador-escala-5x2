import asyncio, re
from playwright.async_api import async_playwright
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida", "exp") + "/"
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
async def main():
    import os; os.makedirs(D, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width":1440,"height":1000}, accept_downloads=True); pg = await ctx.new_page()
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("lojas"); await pg.fill("#ns-names", "Loja 2"); await pg.click("#ns-create"); await pg.wait_for_timeout(600); await go("personalizar"); await pg.wait_for_timeout(500)
        await go("equipe"); await pg.get_by_role("button", name="Adicionar várias").click()
        await pg.fill("#bulk-names", "Ana\nBia\nCaio"); await pg.get_by_role("button", name=re.compile("Adicionar 3")).click(); await pg.wait_for_timeout(500)
        await pg.click("#store-filter"); await pg.get_by_role("button", name="Selecionar todas").click(); await pg.keyboard.press("Escape")
        await go("escala")
        for name in ["Baixar semana (PDF)", "Excel", "Escala por pessoa (PDF)"]:
            async with pg.expect_download(timeout=60000) as dl:
                await pg.locator("#semana").get_by_role("button", name=name, exact=True).click()
            d = await dl.value; f = D + d.suggested_filename; await d.save_as(f); print(name, "->", d.suggested_filename, os.path.getsize(f))
        await go("mes")
        btn = pg.locator("#mes").get_by_role("button", name=re.compile("PDF"))
        if await btn.count():
            async with pg.expect_download(timeout=60000) as dl: await btn.first.click()
            d = await dl.value; f = D + d.suggested_filename; await d.save_as(f); print("mes ->", d.suggested_filename, os.path.getsize(f))
        print("errors", errs); await b.close()
asyncio.run(main())
