# Regras avançadas 5b: quem folga no domingo também folga no sábado (só liga/desliga, sem %)
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
        linha = await pg.inner_text("#ra-sabdom-linha")
        check("regra aparece", "Quem folga no domingo também folga no sábado" in linha)
        check("explica o domingo anterior e o sábado sem folga", "domingo anterior" in linha and "sábado marcado como dia sem folga" in linha)
        chave = pg.locator("#ra-sabdom")
        check("começa desligada", not await chave.is_checked())
        await pg.click("#ra-sabdom"); await pg.wait_for_timeout(400)
        check("ligada", await chave.is_checked())
        check("sem campo de %", await pg.locator("#ra-sabdom-pct").count() == 0 and "%" not in await pg.inner_text("#ra-sabdom-linha"))
        check("aparece 'Onde vale'", await pg.locator("#ra-onde-sabadoComDomingo").count() == 1)
        await pg.locator("#ra-sabdom-linha").screenshot(path=D+"sabado_domingo.png")
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        check("gravado após recarregar", await pg.locator("#ra-sabdom").is_checked())
        # gerar a escala com a regra ligada
        await pg.evaluate("location.hash='escala'"); await pg.wait_for_timeout(1500)
        await pg.get_by_role("button", name="Gerar escala", exact=True).click()
        await pg.wait_for_function("()=>![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Gerando…')", timeout=120000); await pg.wait_for_timeout(800)
        rel = await pg.locator("div[role=status].rounded-2xl").first.inner_text()
        check("gera com a regra ligada", rel.startswith("ESCALA"), rel[:200])
        fds = await pg.inner_text("#rep-fds") if await pg.locator("#rep-fds").count() else ""
        check("relatório: sábados em rodízio e fins de semana inteiros por pessoa", "Sábados de folga em rodízio" in fds and "Fins de semana inteiros (regra 5b)" in fds, fds)
        import re as _re
        m = _re.search(r"— (?:de )?(\d+)(?: a (\d+))? por pessoa", fds)
        check("fins de semana inteiros divididos: diferença de no máximo 1", m and (not m.group(2) or int(m.group(2)) - int(m.group(1)) <= 1), fds)
        # desligar
        await pg.evaluate("location.hash='regras'"); await pg.wait_for_timeout(1200)
        await pg.click("#ra-sabdom"); await pg.wait_for_timeout(400)
        check("desligada de novo", not await pg.locator("#ra-sabdom").is_checked())
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
