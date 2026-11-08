# Horários: arrastar os turnos para mudar a ordem (e setas ‹ ›).
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
        pg = await b.new_page(viewport={"width": 1500, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)
        await go("horarios")
        ordem = lambda: pg.eval_on_selector_all("[data-turno]", "els=>els.map(e=>e.querySelector('[id^=h-name-]').value)")
        antes = await ordem()
        print("antes", antes)
        ids = await pg.eval_on_selector_all("[data-turno]", "els=>els.map(e=>e.dataset.turno)")
        # arrasta o 3º turno para o lugar do 1º
        await pg.drag_and_drop(f"#h-drag-{ids[2]}", f"#h-card-{ids[0]}"); await pg.wait_for_timeout(800)
        depois = await ordem()
        print("depois", depois)
        check("Arrastar: o 3º turno vai para o 1º lugar", depois[0] == antes[2] and depois[1] == antes[0] and depois[2] == antes[1], depois)
        # setas
        nid = await pg.eval_on_selector_all("[data-turno]", "els=>els.map(e=>e.dataset.turno)")
        await pg.click(f"#h-down-{nid[0]}"); await pg.wait_for_timeout(500)
        d2 = await ordem()
        check("Seta ›: troca com o próximo", d2[0] == depois[1] and d2[1] == depois[0], d2)
        # a ordem fica salva e aparece na Equipe
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(3500); await go("horarios")
        check("Ordem salva depois de recarregar", await ordem() == d2, await ordem())
        await go("equipe")
        sel = await pg.eval_on_selector("[id^='s-shift-']", "s=>[...s.options].map(o=>o.textContent.split(' (')[0]).filter(t=>!t.startsWith('—'))")
        regulares = [t for t in d2 if t in sel]
        check("Equipe: turnos na mesma ordem", sel[: len(regulares)] == regulares, (sel, d2))
        await go("horarios")
        await pg.locator("[data-turno]").first.screenshot(path=D + "turno_arrastar.png")
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
