# Relatório 28/10: almoços automáticos, feriado como folga, dias sem folga, alerta com a data.
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
        ctx = await b.new_context(viewport={"width": 1500, "height": 1000})
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)

        # feriado como folga + dias sem folga
        await go("personalizar")
        await pg.locator("#dias-sem-folga").scroll_into_view_if_needed()
        check("Feriado conta como folga (ligado por padrão)", await pg.is_checked("#hol-conta-folga"))
        await pg.click("#dsf-natal"); await pg.wait_for_timeout(800)
        chips = await pg.eval_on_selector_all("[data-dia-sem-folga]", "els=>els.map(e=>e.dataset.diaSemFolga)")
        check("24/12 e 31/12 todo ano", chips == ["12-24", "12-31"], chips)
        await pg.fill("#dsf-d", "2026-11-20"); await pg.uncheck("#dsf-ano"); await pg.click("#dsf-add"); await pg.wait_for_timeout(600)
        chips = await pg.eval_on_selector_all("[data-dia-sem-folga]", "els=>els.map(e=>e.dataset.diaSemFolga)")
        check("Dia sem folga com data exata", "2026-11-20" in chips, chips)
        await pg.locator("#dias-sem-folga").screenshot(path=D + "dias_sem_folga.png")
        # gera e confere que ninguém folga em 20/11
        await go("escala")
        await pg.get_by_role("button", name="Gerar escala", exact=True).first.click(); await pg.wait_for_timeout(6000)
        rep = await pg.locator("#rep-almoco").count()
        check("Gerar escala cuida dos almoços", rep == 1 and "horário fixo" in await pg.inner_text("#rep-almoco"))
        if rep: print("   ", await pg.inner_text("#rep-almoco"))
        await go("mes")
        # célula de 20/11 de cada pessoa: nenhuma folga
        folgas20 = await pg.evaluate("""() => { const th=[...document.querySelectorAll('#mes thead th')]; const i=th.findIndex(t=>/^[A-Z]20/.test(t.textContent.trim())); if(i<0) return -1; return [...document.querySelectorAll('#mes tbody tr')].filter(tr=>tr.children[i] && tr.children[i].textContent.trim()==='F').length; }""")
        check("Ninguém folga no dia sem folga (20/11)", folgas20 == 0, folgas20)
        # alertas: dizem a data quando não é toda semana
        await go("escala")
        txt = await pg.inner_text("main")
        check("Alertas não usam mais 'em N de M semanas' sem data", re.search(r"\(em \d+ de \d+ semanas\)", txt) is None)
        # almoço
        await go("almoco")
        await pg.wait_for_timeout(1500)
        check("Almoço: todo mundo com horário (fixo sugerido)", await pg.locator("[id^='alm-hora-']").count() > 3)
        # duas semanas: nenhum almoço fora do horário do intervalo do turno
        vermelhos = 0
        for _ in range(2):
            vermelhos += await pg.locator("button[data-fora]").count()
            await pg.get_by_role("button", name="Próxima semana").click(); await pg.wait_for_timeout(600)
        check("Nenhum almoço fora do horário do intervalo", vermelhos == 0, vermelhos)
        await pg.screenshot(path=D + "almoco_auto.png", full_page=False)
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
