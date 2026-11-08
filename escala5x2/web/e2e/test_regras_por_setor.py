# Regras avançadas: escolher para qual setor valem
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
        opts = await pg.eval_on_selector_all("#ra-alvo option", "o=>o.map(x=>x.textContent)")
        check("seletor 'Para qual setor'", opts[0].startswith("Toda a loja") and any("Açougue · segue a loja" == o for o in opts), opts[:3])
        consec_loja = await pg.input_value("#ra-consec")
        check("na loja: 'Onde vale' e setor da regra 3 aparecem", True)
        # escolher Açougue
        val = await pg.eval_on_selector("#ra-alvo", "s=>[...s.options].find(o=>o.text.startsWith('Açougue')).value")
        await pg.select_option("#ra-alvo", val); await pg.wait_for_timeout(300)
        check("setor que segue a loja: campos bloqueados", await pg.is_disabled("#ra-consec"))
        check("texto explica que segue a loja", "segue as regras da loja" in await pg.inner_text("#ra-alvo-info"))
        await pg.click("#ra-usar-proprias"); await pg.wait_for_timeout(400)
        check("regras próprias: campos liberados", not await pg.is_disabled("#ra-consec"))
        check("começa igual à loja", await pg.input_value("#ra-consec") == consec_loja)
        check("sem 'Onde vale' e sem escolher setor na regra 3", await pg.locator("#ra-dias-setores").count() == 0 and await pg.locator("#ra-limite-setor").count() == 0)
        await pg.fill("#ra-consec", "5"); await pg.press("#ra-consec", "Enter"); await pg.wait_for_timeout(300)
        await pg.select_option("#ra-pref-folgas", "juntas"); await pg.wait_for_timeout(300)
        check("gerar escala do setor escolhido", "Gerar a escala de Açougue agora" in await pg.inner_text("#ra-painel"))
        await pg.locator("#ra-painel").screenshot(path=D+"regras_por_setor.png")
        # voltar para a loja: valores da loja não mudaram
        await pg.select_option("#ra-alvo", "loja"); await pg.wait_for_timeout(300)
        check("loja continua com o próprio valor", await pg.input_value("#ra-consec") == consec_loja)
        check("loja: regra 1 não mudou", await pg.input_value("#ra-pref-folgas") == "separadas")
        info = await pg.inner_text("#ra-alvo-info")
        check("loja lista quem tem regras próprias", "Açougue" in info and "regras próprias" in info, info)
        # recarregar: gravado
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500)
        await pg.wait_for_timeout(300)
        lab = await pg.eval_on_selector("#ra-alvo", "s=>[...s.options].map(o=>o.text).find(t=>t.startsWith('Açougue'))")
        check("gravado: Açougue com regras próprias", lab == "Açougue · regras próprias", lab)
        await pg.select_option("#ra-alvo", val); await pg.wait_for_timeout(300)
        check("gravado: valor próprio", await pg.input_value("#ra-consec") == "5" and await pg.input_value("#ra-pref-folgas") == "juntas")
        # voltar a seguir a loja (confirmação em dois passos)
        btn = pg.get_by_role("button", name="Voltar a seguir a loja"); await btn.click(); await pg.wait_for_timeout(200)
        await pg.get_by_role("button", name="Confirmar: Açougue segue a loja").click(); await pg.wait_for_timeout(400)
        check("voltou a seguir a loja", await pg.is_disabled("#ra-consec") and await pg.input_value("#ra-consec") == consec_loja)
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(400)
        over = await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
