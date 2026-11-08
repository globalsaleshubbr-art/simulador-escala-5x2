# Almoço linear na janela (12h–15h) e ordem das pessoas na tela de Almoço.
import asyncio, os, re
from playwright.async_api import async_playwright
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))
h = lambda t: int(t[:2]) * 60 + int(t[3:5])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1500, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(x): await pg.evaluate(f"location.hash='{x}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("horarios")
        ids = await pg.eval_on_selector_all("[id^='h-win-s-']", "els=>els.map(e=>e.id.slice(8))")
        check("Horários: turnos com horário do intervalo (de … a …)", len(ids) >= 2, ids)
        check("Sem os campos antigos (início do intervalo, janela, modo, distribuição)", await pg.locator("[id^='h-brk-'], [id^='h-win-on-'], [id^='h-win-m-'], [id^='h-win-d-'], [id^='h-flex-']").count() == 0)
        for sid in ids:
            # o intervalo inteiro entre 12:00 e 16:00: quem tem 1h começa até as 15:00
            await pg.fill(f"#h-win-s-{sid}", "12:00"); await pg.wait_for_timeout(150)
            await pg.fill(f"#h-win-e-{sid}", "16:00"); await pg.wait_for_timeout(150)
        check("Texto explica a distribuição por igual", "distribuídos por igual" in await pg.inner_text(f"#h-win-txt-{ids[0]}"))
        await pg.locator(f"#h-win-{ids[0]}").screenshot(path=D + "almoco_janela_linear.png")
        await go("escala")
        await pg.get_by_role("button", name="Gerar escala inteligente").first.click(); await pg.wait_for_timeout(6000)
        await go("almoco")
        # primeiro dia útil do período
        vals = await pg.eval_on_selector_all("[id^='alm-brk-']", "els=>els.map(e=>e.value)")
        check("Almoço: pessoas com intervalo", len(vals) >= 4, vals)
        ordem = await pg.eval_on_selector_all("[id^='alm-ordem-'] [data-ordem]", "els=>els.map(e=>[e.dataset.ordem,e.getAttribute('aria-checked')])")
        check("Ordem: começa pelo horário do almoço", ["almoco", "true"] in ordem, ordem)
        mins = [h(v) for v in vals]
        check("Lista em ordem de horário do almoço", mins == sorted(mins), vals)
        # linear: começa às 12h, termina às 15h e sem amontoar
        check("Primeiro almoço às 12:00", mins and mins[0] == 720, vals)
        check("Último almoço começa até as 15:00", mins and mins[-1] <= 900 and mins[-1] >= 840, vals)
        gaps = [b2 - a2 for a2, b2 in zip(mins, mins[1:])]
        check("Espaçados por igual (nenhum buraco grande)", gaps and max(gaps) <= 45, gaps)
        check("No máximo 2 saindo juntos", max(mins.count(x) for x in set(mins)) <= 2, vals)
        await pg.locator("table").first.screenshot(path=D + "almoco_linear_ordem.png")
        # ordem por nome
        await pg.locator("[id^='alm-ordem-'] [data-ordem='nome']").first.click(); await pg.wait_for_timeout(500)
        nomes = await pg.eval_on_selector_all("table tbody tr th[scope=row]", "els=>els.map(e=>e.childNodes[0].textContent.trim())")
        nomes = [n for n in nomes if n not in ("Chegam", "Saem", "No posto", "Em intervalo", "Mínimo", "Sobra / falta")]
        import locale
        esperado = await pg.evaluate("n=>[...n].sort((a,b)=>a.localeCompare(b,'pt-BR'))", nomes)
        check("Ordem por nome", nomes == esperado, [x for x, y in zip(nomes, esperado) if x != y][:3])
        # clicar no cabeçalho Intervalo volta para horário
        await pg.locator("[id^='alm-ord-int-']").first.click(); await pg.wait_for_timeout(500)
        vals2 = await pg.eval_on_selector_all("[id^='alm-brk-']", "els=>els.map(e=>e.value)")
        check("Cabeçalho Intervalo ordena por horário", [h(v) for v in vals2] == sorted(h(v) for v in vals2), vals2)
        # lembra a escolha ao recarregar
        await pg.locator("[id^='alm-ordem-'] [data-ordem='entrada']").first.click(); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_timeout(3500); await go("almoco")
        sel = await pg.eval_on_selector_all("[id^='alm-ordem-'] [aria-checked='true']", "els=>els.map(e=>e.dataset.ordem)")
        check("Lembra a ordem escolhida", sel[:1] == ["entrada"], sel)
        check("Sem erros na página", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f"OK {len(ok)}"); [print("  ✓", x) for x in ok]
print(f"FALHAS {len(fail)}"); [print("  ✗", x) for x in fail]
