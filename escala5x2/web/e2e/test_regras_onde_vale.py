# Regras avançadas: cada regra escolhe em quais setores vale
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
        check("padrão (separadas quando der): sem 'Onde vale'", await pg.locator("#ra-onde-folgasSeparadas").count() == 0)
        await pg.select_option("#ra-pref-folgas", "juntas"); await pg.wait_for_timeout(300)
        check("regra ligada: aparece 'Onde vale'", await pg.locator("#ra-onde-folgasSeparadas").count() == 1)
        check("botão mostra Todos os setores", "Todos os setores" in await pg.inner_text("#ra-onde-folgasSeparadas-btn"))
        await pg.click("#ra-onde-folgasSeparadas-btn"); await pg.wait_for_timeout(200)
        check("padrão: todos os setores marcado", await pg.is_checked("#ra-onde-folgasSeparadas-todos"))
        check("formato de caixas de marcar", await pg.get_attribute("#ra-onde-folgasSeparadas-todos", "type") == "checkbox")
        chips = pg.locator("#ra-onde-folgasSeparadas input[id^='ra-onde-folgasSeparadas-sec']")
        n = await chips.count()
        check("um botão por setor", n >= 5, n)
        await chips.nth(1).click(); await pg.wait_for_timeout(300)
        nome1 = (await chips.nth(1).evaluate("i=>i.closest('label').textContent")).strip()
        check("marcar um setor desmarca Todos", await chips.nth(1).is_checked() and not await pg.is_checked("#ra-onde-folgasSeparadas-todos"))
        await chips.nth(2).click(); await pg.wait_for_timeout(300)
        check("vários setores", await chips.nth(2).is_checked())
        await pg.locator("#ra-onde-folgasSeparadas").screenshot(path=D+"onde_vale_aberto.png")
        await pg.click("#ra-onde-folgasSeparadas-ok"); await pg.wait_for_timeout(200)
        check("fecha e mostra os setores escolhidos no botão", await chips.count() == 0 and " e " in await pg.inner_text("#ra-onde-folgasSeparadas-btn"), await pg.inner_text("#ra-onde-folgasSeparadas-btn"))
        # regra 2 com chips
        await pg.click("#ra-dia-6"); await pg.wait_for_timeout(300)
        check("regra 2 usa 'Onde vale' com setores", await pg.locator("#ra-onde-diasSemFolga").count() == 1 and await pg.locator("#ra-dias-setores").count() == 0)
        await pg.click("#ra-onde-diasSemFolga-btn"); await pg.wait_for_timeout(200)
        await pg.locator("#ra-onde-diasSemFolga input[id^='ra-onde-diasSemFolga-sec']").first.click()
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        check("Esc fecha a lista", await pg.locator("#ra-onde-diasSemFolga input").count() == 0); await pg.wait_for_timeout(300)
        # outras regras
        await pg.check("#ra-rodizio-dia"); await pg.wait_for_timeout(300)
        check("regra 4 também", await pg.locator("#ra-onde-rodizioDiaFolga").count() == 1)
        await pg.locator("#ra-painel").screenshot(path=D+"regras_onde_vale.png")
        # gravado
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        await pg.wait_for_timeout(300)
        chips = pg.locator("#ra-onde-folgasSeparadas input[id^='ra-onde-folgasSeparadas-sec']")
        await pg.click("#ra-onde-folgasSeparadas-btn"); await pg.wait_for_timeout(200)
        check("gravado", await chips.nth(1).is_checked() and await chips.nth(2).is_checked())
        await pg.click("#ra-onde-folgasSeparadas-ok"); await pg.wait_for_timeout(200)
        # setor que segue a loja mostra a regra só se vale nele
        val = await pg.eval_on_selector("#ra-alvo", f"s=>[...s.options].find(o=>o.text.startsWith({nome1!r})).value")
        await pg.select_option("#ra-alvo", val); await pg.wait_for_timeout(300)
        check("no setor escolhido a regra 1 aparece ligada", await pg.input_value("#ra-pref-folgas") == "juntas")
        outro = await pg.eval_on_selector("#ra-alvo", "s=>[...s.options].map(o=>o.value).filter(v=>v!=='loja')")
        idx = [x for x in outro if x != val]
        # um setor fora da lista
        fora = None
        for v in idx:
            await pg.select_option("#ra-alvo", v); await pg.wait_for_timeout(200)
            if await pg.input_value("#ra-pref-folgas") == "separadas": fora = v; break
        check("num setor fora da lista a regra 1 aparece desligada", fora is not None)
        # "Todos os setores" limpa
        await pg.select_option("#ra-alvo", "loja"); await pg.wait_for_timeout(300)
        await pg.click("#ra-onde-folgasSeparadas-btn"); await pg.wait_for_timeout(200)
        await pg.click("#ra-onde-folgasSeparadas-todos"); await pg.wait_for_timeout(300)
        check("Todos os setores limpa a escolha", await pg.is_checked("#ra-onde-folgasSeparadas-todos") and not await pg.locator("#ra-onde-folgasSeparadas input[id^='ra-onde-folgasSeparadas-sec']:checked").count())
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
