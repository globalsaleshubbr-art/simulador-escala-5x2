# Teste de usabilidade (29/10): equipe grande gera, menu do celular mostra que tem mais, setor vazio sem alarme.
import asyncio, os
from playwright.async_api import async_playwright
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # celular: seta de "mais" no menu, some no fim
        cel = await b.new_page(viewport={"width": 390, "height": 844})
        errs = []; cel.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await cel.goto(URL); await cel.wait_for_timeout(3500)
        check("Celular: seta de mais itens no menu", await cel.locator("#menu-mais").count() == 1)
        for _ in range(8):
            if not await cel.locator("#menu-mais").count(): break
            await cel.click("#menu-mais"); await cel.wait_for_timeout(600)
        check("Celular: no fim do menu a seta some", await cel.locator("#menu-mais").count() == 0)
        await cel.evaluate("location.hash='personalizar'"); await cel.wait_for_timeout(900)
        vis = await cel.evaluate("()=>{const b=document.querySelector('nav [aria-current=page]').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth}")
        check("Celular: página aberta aparece no menu", vis)
        # computador: equipe grande
        pg = await b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("equipe"); await pg.click("#eq-importar"); await pg.wait_for_timeout(400)
        csv = ("Nome\n" + "\n".join(f"Pessoa Carga {i:02d}" for i in range(43))).encode()
        await pg.set_input_files("#imp-file", files=[{"name": "c.csv", "mimeType": "text/csv", "buffer": csv}]); await pg.wait_for_timeout(700)
        await pg.click("#imp-confirmar"); await pg.wait_for_timeout(800)
        await go("escala")
        await pg.get_by_role("button", name="Gerar escala", exact=True).first.click()
        await pg.wait_for_function("()=>!/Gerando/.test(document.body.innerText)", timeout=120000); await pg.wait_for_timeout(500)
        txt = await pg.inner_text("main")
        check("Equipe de 60: escala gerada", "escala gerada" in txt.lower() or "escala mantida" in txt.lower(), txt[:200])
        check("Equipe de 60: avisa que aumentou o limite de folgas", await pg.locator("#rep-aviso").count() >= 1)
        # setor vazio: sem números vermelhos
        await go("lojas"); await pg.fill("#ns-names", "Loja Vazia"); await pg.click("#ns-mode-estrutura"); await pg.click("#ns-create"); await pg.wait_for_timeout(1200)
        await go("escala")
        check("Setor vazio: mensagem para cadastrar a equipe", await pg.locator("#setor-vazio").count() == 1)
        check("Setor vazio: sem 'Horas faltando' em vermelho", "Horas faltando" not in await pg.inner_text("main"))
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
