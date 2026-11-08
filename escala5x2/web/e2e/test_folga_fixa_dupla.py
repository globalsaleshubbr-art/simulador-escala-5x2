# Até duas folgas fixas por pessoa: a 2ª aparece na Equipe e a escala respeita os dois dias.
import asyncio, os, re
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
        await go("equipe")
        ids = await pg.eval_on_selector_all("[id^='s-fix-']", "els=>els.map(e=>e.id.slice(6))")
        check("Equipe: coluna Folga fixa", len(ids) > 3, len(ids))
        eid = ids[0]
        nome = await pg.input_value(f"#s-name-{eid}")
        check("Sem folga fixa: não mostra a 2ª", await pg.locator(f"#s-fix2-{eid}").count() == 0)
        await pg.select_option(f"#s-fix-{eid}", "3"); await pg.wait_for_timeout(700)
        check("Com 1ª folga fixa: aparece a 2ª", await pg.locator(f"#s-fix2-{eid}").count() == 1)
        opts = await pg.eval_on_selector_all(f"#s-fix2-{eid} option", "els=>els.map(e=>e.value)")
        check("2ª folga não repete o dia da 1ª", "3" not in opts and "6" in opts, opts)
        await pg.select_option(f"#s-fix2-{eid}", "6"); await pg.wait_for_timeout(1500)
        check("2ª folga fixa gravada (Sáb)", await pg.input_value(f"#s-fix2-{eid}") == "6")
        await pg.locator("tr", has=pg.locator(f"#s-fix-{eid}")).screenshot(path=D + "folga_fixa_dupla_equipe.png")
        # filtro por folga: aparece filtrando por Sáb também
        await pg.select_option("#eq-folga", "6"); await pg.wait_for_timeout(400)
        check("Filtro Sáb mostra quem tem a 2ª folga no sábado", await pg.locator(f"#s-fix-{eid}").count() == 1)
        await pg.select_option("#eq-folga", "all")
        # escala do mês: todas as quartas e sábados de folga
        await go("escala")
        await pg.locator("#mes").scroll_into_view_if_needed(); await pg.wait_for_timeout(800)
        labels = await pg.eval_on_selector_all("#mes tbody td button[aria-label]", "els=>els.map(e=>e.getAttribute('aria-label'))")
        meus = [l for l in labels if l.startswith(nome + " · ")]
        qs = [l for l in meus if re.search(r"(quarta|sábado)", l, re.I)]
        nao_folga = [l for l in qs if ": Folga" not in l and "feriado" not in l.lower() and "Férias" not in l]
        check("Mês: quartas e sábados da pessoa são folga", len(qs) >= 6 and not nao_folga, (len(qs), nao_folga[:3]))
        # tirar a 1ª folga fixa: some a 2ª também
        await go("equipe")
        await pg.select_option(f"#s-fix-{eid}", "-1"); await pg.wait_for_timeout(800)
        check("Sem a 1ª, a 2ª sai junto", await pg.locator(f"#s-fix2-{eid}").count() == 0)
        # 6x1: não oferece 2ª folga fixa
        await pg.select_option(f"#s-fix-{eid}", "2"); await pg.wait_for_timeout(500)
        regs = await pg.eval_on_selector_all(f"#s-reg-{eid} option", "els=>els.map(e=>e.value)")
        if "f1" in regs:
            await pg.select_option(f"#s-reg-{eid}", "f1"); await pg.wait_for_timeout(900)
            check("6x1: sem a 2ª folga fixa", await pg.locator(f"#s-fix2-{eid}").count() == 0)
        # alteração em massa: 2ª folga
        await pg.select_option("#eq-folga", "none"); await pg.wait_for_timeout(400)
        await pg.select_option("#eq-bulk-folga", "6"); await pg.wait_for_timeout(300)
        check("Alterar mostrados: campo 2ª folga fixa", await pg.locator("#eq-bulk-folga2").count() == 1)
        check("Sem erros na página", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f"OK {len(ok)}"); [print("  ✓", x) for x in ok]
print(f"FALHAS {len(fail)}"); [print("  ✗", x) for x in fail]
