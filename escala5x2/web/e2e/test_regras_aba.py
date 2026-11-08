# Regras avançadas numa aba própria do menu (saíram de Personalizar) e menu cabendo em telas de notebook
import asyncio, os
from playwright.async_api import async_playwright
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1366,"height":768})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(5000)
        menu = await pg.eval_on_selector_all("nav[aria-label=Menu] button", "bs=>bs.map(b=>[b.textContent.trim(), Math.round(b.getBoundingClientRect().bottom)])")
        nomes = [m[0] for m in menu]
        check("menu tem a aba Regras avançadas", any(n.startswith("Regras avançadas") for n in nomes), nomes)
        check("Regras avançadas entre Fluxo alto e Lojas", [n.split("Folgas")[0] for n in nomes].index(next(n for n in nomes if n.startswith("Regras avançadas")).split("Folgas")[0]) == [i for i, n in enumerate(nomes) if n.startswith("Fluxo alto")][0] + 1, nomes)
        check("notebook 1366×768: todos os itens do menu cabem sem rolar", max(m[1] for m in menu) <= 768, menu[-3:])
        await pg.get_by_role("button", name="Regras avançadas").first.click(); await pg.wait_for_timeout(1500)
        check("abre a página Regras avançadas", (await pg.inner_text("h1")).strip() == "Regras avançadas" and await pg.locator("#regras-pagina #ra-pref-folgas").count() == 1)
        check("endereço #regras", (await pg.evaluate("location.hash")) == "#regras")
        # Personalizar não tem mais as regras nem o aviso
        await pg.evaluate("location.hash='personalizar'"); await pg.wait_for_timeout(1500)
        check("Personalizar sem as regras", await pg.locator("#ra-pref-folgas").count() == 0 and await pg.locator("summary", has_text="Regras avançadas").count() == 0)
        check("Personalizar sem o aviso das regras", await pg.locator("#regras-mudou").count() == 0 and "agora ficam numa aba" not in await pg.inner_text("main"))
        # nome novo do menu
        check("menu mostra Fluxo alto (não Necessidade)", await pg.locator("nav[aria-label=Menu] button", has_text="Fluxo alto").count() == 1 and await pg.locator("nav[aria-label=Menu] button", has_text="Necessidade").count() == 0)
        await pg.evaluate("location.hash='necessidade'"); await pg.wait_for_timeout(1200)
        check("título da tela Fluxo alto", (await pg.inner_text("h1")).strip().startswith("Fluxo alto"), await pg.inner_text("h1"))
        # celular: a aba aparece na barra de rolagem do menu
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(500)
        check("celular: aba no menu", await pg.locator("nav[aria-label=Menu] button", has_text="Regras avançadas").count() == 1)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
