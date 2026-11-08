# Personalizar → Setores: lista compacta (arrastar, cor, nome, esconder/mostrar, criar, excluir).
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
        async def go(x): await pg.evaluate(f"location.hash='{x}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("personalizar")
        alt = (await pg.locator("#setores").bounding_box())["height"]
        check("Card de setores compacto (< 600px)", alt < 600, alt)
        ordem = await pg.eval_on_selector_all("#sec-lista [data-setor]", "els=>els.map(e=>e.dataset.setor)")
        check("Setores mostrados na lista", len(ordem) >= 4, ordem)
        check("Sem campos 'Uma pessoa é / Várias são'", await pg.locator("[id^='sec-sing-'], [id^='sec-plur-']").count() == 0)
        # arrastar o 3º para o 1º lugar
        await pg.drag_and_drop(f"#sec-drag-{ordem[2]}", f"#sec-item-{ordem[0]}"); await pg.wait_for_timeout(500)
        o2 = await pg.eval_on_selector_all("#sec-lista [data-setor]", "els=>els.map(e=>e.dataset.setor)")
        check("Arrastar muda a ordem", o2[0] == ordem[2] and o2[1] == ordem[0], o2[:3])
        # teclado
        await pg.focus(f"#sec-drag-{ordem[2]}"); await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(400)
        o3 = await pg.eval_on_selector_all("#sec-lista [data-setor]", "els=>els.map(e=>e.dataset.setor)")
        check("Setas do teclado mudam a ordem", o3[1] == ordem[2], o3[:3])
        # cor
        await pg.click(f"#sec-cor-{ordem[0]}"); await pg.wait_for_timeout(200)
        await pg.locator(f"#sec-item-{ordem[0]} [aria-label^='Cor #']").nth(3).click(); await pg.wait_for_timeout(300)
        check("Paleta fecha depois de escolher a cor", await pg.locator(f"#sec-item-{ordem[0]} [aria-label^='Cor #']").count() == 0)
        # renomear
        await pg.fill(f"#sec-name-{ordem[0]}", "Caixas"); await pg.press(f"#sec-name-{ordem[0]}", "Tab"); await pg.wait_for_timeout(300)
        check("Renomear", await pg.input_value(f"#sec-name-{ordem[0]}") == "Caixas")
        # esconder e mostrar
        n_esc = await pg.locator("#sec-escondidos [data-mostrar]").count()
        await pg.click(f"#sec-esconder-{ordem[-1]}"); await pg.wait_for_timeout(300)
        check("Esconder leva para a linha de escondidos", await pg.locator("#sec-escondidos [data-mostrar]").count() == n_esc + 1 and await pg.locator(f"#sec-item-{ordem[-1]}").count() == 0)
        await pg.click(f"#sec-escondidos [data-mostrar='{ordem[-1]}']"); await pg.wait_for_timeout(300)
        check("Mostrar volta para a lista", await pg.locator(f"#sec-item-{ordem[-1]}").count() == 1)
        # criar
        await pg.fill("#ns-name", "Peixaria"); await pg.press("#ns-name", "Enter"); await pg.wait_for_timeout(500)
        nomes = await pg.eval_on_selector_all("#sec-lista input[aria-label='Nome do setor']", "els=>els.map(e=>e.value)")
        check("Criar setor com Enter", "Peixaria" in nomes, nomes)
        # recriar um escondido: volta a aparecer
        esc = await pg.eval_on_selector_all("#sec-escondidos [data-mostrar]", "els=>els.map(e=>e.textContent.replace('+ ',''))")
        if esc:
            await pg.fill("#ns-name", esc[0]); await pg.click("#ns-criar"); await pg.wait_for_timeout(500)
            nomes2 = await pg.eval_on_selector_all("#sec-lista input[aria-label='Nome do setor']", "els=>els.map(e=>e.value)")
            check("Nome de setor escondido: mostra o que já existe (sem duplicar)", nomes2.count(esc[0]) == 1, nomes2)
        # excluir (com confirmação)
        pid = (await pg.eval_on_selector_all("#sec-lista [data-setor]", "els=>els.map(e=>e.dataset.setor)"))[-1]
        await pg.locator(f"#sec-item-{pid} button[title^='Excluir']").click(); await pg.wait_for_timeout(200)
        await pg.locator(f"#sec-item-{pid}").get_by_role("button", name="Excluir").click(); await pg.wait_for_timeout(400)
        check("Excluir com confirmação", await pg.locator(f"#sec-item-{pid}").count() == 0)
        await pg.locator("#setores").screenshot(path=D + "setores_compacto.png")
        # celular
        await pg.set_viewport_size({"width": 390, "height": 900}); await pg.wait_for_timeout(500)
        sw = await pg.evaluate("document.documentElement.scrollWidth")
        check("Celular: sem rolagem lateral", sw <= 392, sw)
        await pg.locator("#setores").screenshot(path=D + "setores_celular.png")
        check("Sem erros na página", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f"OK {len(ok)}"); [print("  ✓", x) for x in ok]
print(f"FALHAS {len(fail)}"); [print("  ✗", x) for x in fail]
