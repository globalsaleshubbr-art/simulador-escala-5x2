# Cobertura da semana com 2, 3 ou 4 cores (critério % do quadro)
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
COLORS="[...document.querySelectorAll('#cov-scroll tbody button:not([disabled])')].map(b=>getComputedStyle(b).backgroundColor)"
RED="rgb(198, 42, 67)"; AMB="rgb(243, 211, 107)"; LIGHT="rgb(196, 234, 211)"; GREEN="rgb(30, 143, 78)"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#escala"); await pg.wait_for_timeout(4000)
        opts = await pg.eval_on_selector_all("#cov-style option", "o=>o.map(x=>x.textContent)")
        check("estilos 2, 3, 4 cores e degradê", opts == ["2 cores","3 cores","4 cores","Degradê de uma cor"], opts)
        check("padrão 3 cores", await pg.input_value("#cov-style") == "3")
        c3 = set(await pg.evaluate(COLORS))
        check("3 cores sem âmbar", AMB not in c3, c3)
        # 4 cores: pouca 30, médio 60, muita 85
        await pg.select_option("#cov-style", "4"); await pg.wait_for_timeout(300)
        check("campo 'Número médio a partir de' aparece", await pg.locator("#cov-mid").count() == 1)
        check("4 linhas de faixa, cada uma com o seu %", await pg.locator("#cov-faixas > div").count() == 4)
        for sel, v in (("#cov-low", "30"), ("#cov-high", "85"), ("#cov-mid", "60")):
            await pg.fill(sel, v); await pg.press(sel, "Enter"); await pg.wait_for_timeout(250)
        de = [await pg.input_value(f"#cov-de-{i}") for i in (2,3,4)]
        check("o começo de cada faixa acompanha o fim da anterior", de == ["30","60","85"], de)
        txt = await pg.inner_text("#cov-faixas")
        check("primeira de 0% e última até 100%", "0\n" in txt or "0" in txt.split("Menos funcionários")[1][:20], txt[:120])
        # mudar o começo da 3ª faixa muda o fim da 2ª
        await pg.fill("#cov-de-3", "55"); await pg.press("#cov-de-3", "Enter"); await pg.wait_for_timeout(250)
        check("começo da faixa 3 = fim da faixa 2", await pg.input_value("#cov-mid") == "55")
        await pg.fill("#cov-mid", "60"); await pg.press("#cov-mid", "Enter"); await pg.wait_for_timeout(250)
        check("limites gravados", [await pg.input_value(x) for x in ("#cov-low","#cov-mid","#cov-high")] == ["30","60","85"])
        c4 = set(await pg.evaluate(COLORS))
        check("4 cores no mapa", {RED, AMB, LIGHT, GREEN} <= c4, c4)
        leg = await pg.inner_text("#cov-legend")
        await pg.locator("#cov-legend").screenshot(path=D+"cobertura_4cores_faixas.png")
        check("legenda com 4 faixas", all(t in leg for t in ("Menos funcionários","Abaixo do médio","Número médio","Mais funcionários")), leg)
        # médio não passa de 'muita gente'
        await pg.fill("#cov-mid", "95"); await pg.press("#cov-mid", "Enter"); await pg.wait_for_timeout(250)
        check("médio limitado a 'muita gente'", await pg.input_value("#cov-mid") == "85")
        await pg.fill("#cov-mid", "60"); await pg.press("#cov-mid", "Enter"); await pg.wait_for_timeout(250)
        # cor própria da 4ª faixa
        await pg.locator("#cov-legend").scroll_into_view_if_needed()
        await pg.click("#cov-c-midlow"); await pg.locator("details:has(#cov-c-midlow) [aria-label='Cor #6250d6']").click(); await pg.wait_for_timeout(400)
        c4b = set(await pg.evaluate(COLORS))
        check("cor de 'abaixo do médio' trocada", "rgb(98, 80, 214)" in c4b and AMB not in c4b, c4b)
        await pg.locator("#cov-scroll").screenshot(path=D+"cobertura_4cores.png")
        # salvo ao recarregar
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        check("4 cores salvo", await pg.input_value("#cov-style") == "4" and await pg.input_value("#cov-mid") == "60")
        await pg.click("#cov-c-reset"); await pg.wait_for_timeout(300)
        # 2 cores
        await pg.select_option("#cov-style", "2"); await pg.wait_for_timeout(300)
        check("2 cores: duas faixas e um limite", await pg.locator("#cov-faixas > div").count() == 2 and await pg.locator("#cov-mid").count() == 0 and await pg.locator("#cov-high").count() == 0)
        c2 = set(await pg.evaluate(COLORS))
        check("2 cores no mapa", c2 <= {RED, GREEN} and len(c2) == 2, c2)
        check("legenda 'Gente suficiente'", "Gente suficiente" in await pg.inner_text("#cov-legend"))
        # voltar a 3
        await pg.select_option("#cov-style", "3"); await pg.wait_for_timeout(300)
        check("volta a 3 cores", AMB not in set(await pg.evaluate(COLORS)) and await pg.locator("#cov-faixas > div").count() == 3)
        # celular: sem rolagem lateral da página
        await pg.set_viewport_size({"width":390,"height":844}); await pg.select_option("#cov-style", "4"); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        await pg.select_option("#cov-style", "4"); await pg.wait_for_timeout(300)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral (4 faixas)", over <= 1, over)
        await pg.locator("#cov-legend").screenshot(path=D+"cobertura_4cores_celular.png")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
