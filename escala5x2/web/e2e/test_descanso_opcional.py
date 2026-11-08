# Regras avançadas, item 14: descanso mínimo entre jornadas ao gerar — opcional (em branco = não usar)
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
        await pg.goto(URL + "#regras"); await pg.wait_for_timeout(4000)
        await pg.wait_for_timeout(300)
        check("campo começa em branco", await pg.input_value("#ra-descanso") == "")
        check("em branco: 'Não usado'", "Não usado" in await pg.inner_text("#ra-descanso-estado"))
        check("explica que é opcional", "Opcional" in await pg.inner_text("#ra-descanso-linha"))
        check("sem 'Onde vale' em branco", await pg.locator("#ra-onde-descansoObrigatorio").count() == 0)
        await pg.fill("#ra-descanso", "11h"); await pg.press("#ra-descanso", "Enter"); await pg.wait_for_timeout(500)
        check("preenchido: mostra 11h", await pg.input_value("#ra-descanso") == "11h", await pg.input_value("#ra-descanso"))
        check("preenchido: 'Respeitado ao gerar'", "Respeitado ao gerar" in await pg.inner_text("#ra-descanso-estado"))
        check("preenchido: aparece 'Onde vale'", await pg.locator("#ra-onde-descansoObrigatorio").count() == 1)
        await pg.locator("#ra-descanso-linha").screenshot(path=D+"descanso_opcional.png")
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        await pg.wait_for_timeout(300)
        check("gravado após recarregar", await pg.input_value("#ra-descanso") == "11h")
        # gerar a escala com a regra ligada funciona
        await pg.evaluate("location.hash='escala'"); await pg.wait_for_timeout(1500)
        await pg.get_by_role("button", name="Gerar escala", exact=True).click()
        await pg.wait_for_function("()=>![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Gerando…')", timeout=120000); await pg.wait_for_timeout(800)
        rel = await pg.locator("div[role=status].rounded-2xl").first.inner_text()
        check("gera com a regra ligada", rel.startswith("ESCALA"), rel[:200])
        # apagar volta a 'Não usado'
        await pg.evaluate("location.hash='regras'"); await pg.wait_for_timeout(1200)
        await pg.fill("#ra-descanso", ""); await pg.press("#ra-descanso", "Enter"); await pg.wait_for_timeout(500)
        check("apagar: volta a 'Não usado'", "Não usado" in await pg.inner_text("#ra-descanso-estado"))
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
