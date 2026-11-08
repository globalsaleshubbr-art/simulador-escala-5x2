# Regras avançadas 5c: quem folga no domingo também folga na segunda, com a % da equipe por domingo
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
        linha = await pg.inner_text("#ra-domseg-linha")
        check("regra aparece", "Quem folga no domingo também folga na segunda" in linha)
        check("explica a semana e a segunda sem folga", "6 dias seguidos" in linha and "segunda marcada como dia sem folga" in linha)
        check("começa desligada, sem campo de %", await pg.locator("#ra-domseg-pct").count() == 0)
        await pg.click("#ra-domseg"); await pg.wait_for_timeout(400)
        check("ligada: campo de % com 30", await pg.input_value("#ra-domseg-pct") == "30", await pg.locator("#ra-domseg-pct").count())
        n = await pg.inner_text("#ra-domseg-n")
        check("mostra quantas pessoas isso dá", "até" in n and "por domingo" in n, n)
        await pg.fill("#ra-domseg-pct", "50"); await pg.press("#ra-domseg-pct", "Tab"); await pg.wait_for_timeout(400)
        n2 = await pg.inner_text("#ra-domseg-n")
        check("mudar a % muda o número de pessoas", n2 != n, (n, n2))
        check("aparece 'Onde vale'", await pg.locator("#ra-onde-segundaComDomingo").count() == 1)
        await pg.locator("#ra-domseg-linha").screenshot(path=D+"segunda_domingo.png")
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        await pg.wait_for_timeout(300)
        check("gravado após recarregar", await pg.input_value("#ra-domseg-pct") == "50")
        # gerar a escala com a regra ligada
        await pg.evaluate("location.hash='escala'"); await pg.wait_for_timeout(1500)
        await pg.get_by_role("button", name="Gerar escala", exact=True).click()
        await pg.wait_for_function("()=>![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Gerando…')", timeout=120000); await pg.wait_for_timeout(800)
        rel = await pg.locator("div[role=status].rounded-2xl").first.inner_text()
        check("gera com a regra ligada", rel.startswith("ESCALA"), rel[:200])
        # desligar
        await pg.evaluate("location.hash='regras'"); await pg.wait_for_timeout(1200)
        await pg.click("#ra-domseg"); await pg.wait_for_timeout(400)
        check("desligar some o campo de %", await pg.locator("#ra-domseg-pct").count() == 0)
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
