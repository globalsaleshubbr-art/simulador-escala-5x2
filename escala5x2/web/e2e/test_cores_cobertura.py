import asyncio, os
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
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(4000)
        cell = pg.locator("#cov-scroll tbody button:not([disabled])")
        async def colors():
            return await pg.evaluate("[...document.querySelectorAll('#cov-scroll tbody button:not([disabled])')].map(b=>getComputedStyle(b).backgroundColor)")
        before = set(await colors())
        # a paleta de cada faixa abre por cima do mapa (nenhuma cor escondida pela tabela)
        for k in ("low", "mid", "high"):
            await pg.locator("#cov-legend").scroll_into_view_if_needed()
            await pg.click(f"#cov-c-{k}"); await pg.wait_for_timeout(300)
            vis = await pg.evaluate(f"""[...document.querySelectorAll('details:has(#cov-c-{k}) [aria-label^="Cor #"]')].map(b=>{{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b}})""")
            check(f"paleta de {k} toda clicável", vis and all(vis), f"{sum(vis)}/{len(vis)}")
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        await pg.click("#cov-c-low"); await pg.locator("details:has(#cov-c-low) [aria-label='Cor #6250d6']").click(); await pg.wait_for_timeout(400)
        check("cor de menos funcionários: cor da 2ª linha aplicada", "rgb(98, 80, 214)" in set(await colors()))
        # escolher a cor de "muita gente" = azul
        await pg.click("#cov-c-high"); await pg.locator("details:has(#cov-c-high) [aria-label='Cor #2a78d6']").click(); await pg.wait_for_timeout(400)
        after = set(await colors())
        check("cor de muita gente aplicada no mapa", "rgb(42, 120, 214)" in after, after)
        await pg.click("#cov-c-low"); await pg.locator("details:has(#cov-c-low) [aria-label='Cor #eda100']").click(); await pg.wait_for_timeout(400)
        check("cor de pouca gente aplicada", "rgb(237, 161, 0)" in set(await colors()))
        el = pg.locator("#cov-legend"); await el.scroll_into_view_if_needed()
        await pg.locator("#cov-scroll").screenshot(path=D+"cobertura_cores.png")
        # degradê
        await pg.select_option("#cov-style", "degrade"); await pg.wait_for_timeout(400)
        g = set(await colors())
        check("degradê usa vários tons", len(g) >= 4, len(g))
        await pg.locator("#cov-scroll").screenshot(path=D+"cobertura_degrade.png")
        # salvo
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        check("estilo salvo", await pg.input_value("#cov-style") == "degrade")
        await pg.select_option("#cov-style", "3"); await pg.wait_for_timeout(300)
        await pg.click("#cov-c-reset"); await pg.wait_for_timeout(300)
        check("voltar às cores originais", set(await colors()) == before)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
