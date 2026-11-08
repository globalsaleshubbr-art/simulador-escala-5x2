# Limpar escala e Desfazer (botão, aviso e Ctrl+Z).
import asyncio, os
from playwright.async_api import async_playwright
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        grade = lambda: pg.eval_on_selector_all("main table tbody td button", "els=>els.slice(0,140).map(e=>e.textContent.trim()).join('|')")
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("escala")
        check("Desfazer desligado no começo", await pg.locator("#esc-desfazer").is_disabled())
        g0 = await grade()
        # muda um dia à mão
        await pg.locator("main table tbody td button").first.click(); await pg.wait_for_timeout(1300)
        g1 = await grade()
        check("Mudou um dia", g1 != g0)
        # gerar escala
        await pg.get_by_role("button", name="Gerar escala", exact=True).first.click()
        await pg.wait_for_function("()=>!/Gerando/.test(document.body.innerText)", timeout=60000); await pg.wait_for_timeout(1300)
        g2 = await grade()
        # desfazer pelo botão: volta ao antes de gerar
        await pg.click("#esc-desfazer"); await pg.wait_for_timeout(800)
        check("Desfazer o Gerar escala volta à escala anterior", await grade() == g1)
        # Ctrl+Z: desfaz a mudança do dia
        await pg.locator("h1").click(); await pg.keyboard.press("Control+z"); await pg.wait_for_timeout(800)
        check("Ctrl+Z desfaz a mudança do dia", await grade() == g0)
        # limpar escala com dia fixado
        await pg.wait_for_timeout(1200)
        await pg.locator("main table tbody td button").first.click(); await pg.wait_for_timeout(1300)
        fixado = (await pg.locator("main table tbody td button").first.inner_text()).strip()
        await pg.click("#esc-limpar"); await pg.wait_for_timeout(400)
        check("Painel Limpar escala abre", await pg.locator("#limpar-painel").count() == 1)
        info = await pg.inner_text("#limpar-painel")
        check("Painel conta os dias fixados à mão", "1 dia fixado" in info, info[:300])
        await pg.locator("#limpar-painel").screenshot(path=D + "limpar_escala.png")
        await pg.click("#limpar-ok"); await pg.wait_for_timeout(1500)
        toast = " | ".join(await pg.eval_on_selector_all("[role='status']", "els=>els.map(e=>e.textContent)"))
        check("Aviso de escala limpa com Desfazer", "limpa" in toast and await pg.locator("#toast-desfazer").count() == 1, toast[:200])
        check("Dia fixado à mão continua depois de limpar", (await pg.locator("main table tbody td button").first.inner_text()).strip() == fixado)
        g3 = await grade()
        # limpar tudo (inclusive o fixado) e desfazer pelo aviso
        await pg.click("#esc-limpar"); await pg.click("#limpar-fixos"); await pg.click("#limpar-loja"); await pg.click("#limpar-ok"); await pg.wait_for_timeout(1500)
        g4 = await grade()
        await pg.click("#toast-desfazer"); await pg.wait_for_timeout(1000)
        check("Desfazer pelo aviso volta antes do Limpar", await grade() == g3, (g3[:60], g4[:60]))
        # o desfazer fica salvo
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500); await go("escala")
        check("Depois de recarregar, continua o estado desfeito", await grade() == g3)
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
