# Almoço: editar o início e o "até" do intervalo (a saída anda junto).
import asyncio, os, re
from playwright.async_api import async_playwright
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))
h = lambda t: int(t[:2]) * 60 + int(t[3:5])
f = lambda m: f"{m // 60:02d}:{m % 60:02d}"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1500, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(x): await pg.evaluate(f"location.hash='{x}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("almoco")
        ids = await pg.eval_on_selector_all("[id^='alm-fim-']", "els=>els.map(e=>e.id.slice(8))")
        check("Campo 'até' editável para cada pessoa", len(ids) >= 3, len(ids))
        eid = ids[0]
        row = pg.locator("tr", has=pg.locator(f"#alm-fim-{eid}"))
        ini = await pg.input_value(f"#alm-brk-{eid}"); fim = await pg.input_value(f"#alm-fim-{eid}")
        txt0 = await row.locator("th").inner_text()
        saida0 = re.findall(r"(\d\d:\d\d)–(\d\d:\d\d)", txt0)[0][1]
        # +30 min no fim
        novo = f(h(fim) + 30)
        await pg.fill(f"#alm-fim-{eid}", novo); await pg.wait_for_timeout(700)
        check("Fim do intervalo gravado", await pg.input_value(f"#alm-fim-{eid}") == novo, await pg.input_value(f"#alm-fim-{eid}"))
        check("Início não mudou", await pg.input_value(f"#alm-brk-{eid}") == ini)
        txt1 = await row.locator("th").inner_text()
        saida1 = re.findall(r"(\d\d:\d\d)–(\d\d:\d\d)", txt1)[0][1]
        check("Saída andou 30 min junto", h(saida1) == h(saida0) + 30, (saida0, saida1))
        check("Selo 'Só hoje'", "SÓ HOJE" in (await row.inner_text()).upper())
        await row.screenshot(path=D + "almoco_fim.png")
        # mudar o início mantém a duração nova
        novo_ini = f(h(ini) + 30)
        await pg.fill(f"#alm-brk-{eid}", novo_ini); await pg.wait_for_timeout(700)
        check("Mudar o início leva o fim junto (duração mantida)", await pg.input_value(f"#alm-fim-{eid}") == f(h(novo) + 30), await pg.input_value(f"#alm-fim-{eid}"))
        # fim antes do início: recusa
        await pg.fill(f"#alm-fim-{eid}", novo_ini); await pg.wait_for_timeout(500)
        check("Fim antes do início é recusado", await pg.input_value(f"#alm-fim-{eid}") == f(h(novo) + 30))
        # ↺ volta tudo
        await row.get_by_role("button", name="↺").click(); await pg.wait_for_timeout(600)
        # ↺ volta ao intervalo de sempre da pessoa (sem nada só deste dia) com a duração original
        i2, f2 = await pg.input_value(f"#alm-brk-{eid}"), await pg.input_value(f"#alm-fim-{eid}")
        check("↺ volta ao intervalo de sempre (duração original, sem 'Só hoje')", h(f2) - h(i2) == h(fim) - h(ini) and "SÓ HOJE" not in (await row.inner_text()).upper(), (i2, f2))
        # todos os dias
        await pg.locator("[id^='alm-scope-'] button", has_text="Todos os dias").first.click(); await pg.wait_for_timeout(400)
        await pg.fill(f"#alm-fim-{eid}", f(h(fim) + 15)); await pg.wait_for_timeout(700)
        check("Todos os dias: fim gravado", await pg.input_value(f"#alm-fim-{eid}") == f(h(fim) + 15), await pg.input_value(f"#alm-fim-{eid}"))
        check("Sem erros na página", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f"OK {len(ok)}"); [print("  ✓", x) for x in ok]
print(f"FALHAS {len(fail)}"); [print("  ✗", x) for x in fail]
