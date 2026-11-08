# Limpar escala por mês: quadradinhos em branco na hora, até Gerar escala.
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
        pg = await b.new_page(viewport={"width": 1440, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("escala")
        await pg.locator("#mes").scroll_into_view_if_needed()
        mes_titulo = (await pg.locator("#mes").inner_text()).split("\n")
        check("Mês sem quadradinhos vazios no começo", await pg.locator("#mes [data-branco]").count() == 0)
        await pg.click("#mes-limpar"); await pg.wait_for_timeout(400)
        meses = await pg.eval_on_selector_all("#limpar-meses [data-mes]", "els=>els.map(e=>[e.dataset.mes,e.getAttribute('aria-pressed')])")
        marcados = [m for m, on in meses if on == "true"]
        check("Painel do Mês já vem com o mês aberto marcado", len(marcados) == 1, meses)
        check("Meses do período aparecem para escolher", len(meses) >= 1, meses)
        await pg.locator("#limpar-painel").screenshot(path=D + "limpar_meses.png")
        await pg.click("#limpar-ok"); await pg.wait_for_timeout(1200)
        vazios = await pg.locator("#mes [data-branco]").count()
        total = await pg.locator("#mes tbody td button").count()
        check("Na hora: quadradinhos do mês ficam vazios", vazios > 0 and vazios >= total * 0.6, (vazios, total))
        check("Aviso de escala em branco", await pg.locator("#aviso-branco").count() == 1)
        await pg.wait_for_timeout(1500)
        check("Continua em branco (não preenche sozinho)", await pg.locator("#mes [data-branco]").count() == vazios)
        await pg.locator("#mes").screenshot(path=D + "mes_em_branco.png")
        # recarregar: continua em branco
        await pg.reload(); await pg.wait_for_timeout(3500); await go("escala")
        check("Depois de recarregar continua em branco", await pg.locator("#mes [data-branco]").count() == vazios)
        # clicar num quadradinho vazio lança à mão
        await pg.locator("#mes [data-branco]").first.click(); await pg.wait_for_timeout(800)
        check("Clicar no vazio lança o dia à mão", await pg.locator("#mes [data-branco]").count() == vazios - 1)
        # gerar: tudo preenchido
        await pg.get_by_role("button", name="Gerar escala inteligente").click()
        for _ in range(40):
            await pg.wait_for_timeout(500)
            if await pg.locator("#mes [data-branco]").count() == 0 and not await pg.locator("text=Gerando…").count(): break
        await pg.wait_for_function("()=>!/Gerando/.test(document.body.innerText)", timeout=60000); await pg.wait_for_timeout(1500)
        check("Gerar escala preenche o mês de novo", await pg.locator("#mes [data-branco]").count() == 0)
        check("Aviso some depois de gerar", await pg.locator("#aviso-branco").count() == 0)
        # limpar pelo botão de cima (período) e desfazer
        await pg.click("#esc-limpar"); await pg.wait_for_timeout(300); await pg.click("#limpar-ok"); await pg.wait_for_timeout(1200)
        n1 = await pg.locator("main [data-branco]").count()
        await pg.click("#toast-desfazer"); await pg.wait_for_timeout(1000)
        check("Desfazer volta a escala depois de limpar", n1 > 0 and await pg.locator("main [data-branco]").count() == 0, n1)
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
