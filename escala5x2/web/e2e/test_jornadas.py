# Jornadas cadastradas: nome, dias por semana e horas por dia, totalmente editáveis.
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
        await go("personalizar")
        await pg.locator("#jornadas").scroll_into_view_if_needed()
        await pg.click("#jr-nova"); await pg.wait_for_timeout(600)
        jid = await pg.get_attribute("#jornadas-editor [data-jornada]", "data-jornada")
        check("Nova jornada criada", bool(jid))
        await pg.fill(f"#jr-nome-{jid}", "Escala Teste"); await pg.press(f"#jr-nome-{jid}", "Tab"); await pg.wait_for_timeout(300)
        await pg.select_option(f"#jr-dias-{jid}", "4"); await pg.wait_for_timeout(300)
        await pg.fill(f"#jr-horas-{jid}", "7h30"); await pg.press(f"#jr-horas-{jid}", "Enter"); await pg.wait_for_timeout(400)
        check("Total da semana 4 × 7h30 = 30h", "30h por semana" in await pg.inner_text(f"#jr-total-{jid}"), await pg.inner_text(f"#jr-total-{jid}"))
        check("Nome salvo", await pg.input_value(f"#jr-nome-{jid}") == "Escala Teste")
        await pg.locator("#jornadas").screenshot(path=D + "jornadas.png")
        # exemplo pronto
        await pg.get_by_role("button", name=re.compile("^Meio período")).click(); await pg.wait_for_timeout(500)
        check("Exemplo Meio período criado", await pg.locator("#jornadas-editor [data-jornada]").count() == 2)
        # Equipe: escolher a jornada para uma pessoa
        await go("equipe")
        ids = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.id.slice(6))")
        eid = ids[0]; nome = await pg.input_value(f"#s-name-{eid}")
        opts = await pg.eval_on_selector(f"#s-reg-{eid}", "s=>[...s.options].map(o=>o.textContent)")
        check("Regime lista as jornadas", any("Escala Teste" in o for o in opts) and any("Meio período" in o for o in opts), opts)
        await pg.select_option(f"#s-reg-{eid}", f"j:{jid}"); await pg.wait_for_timeout(1000)
        check("Pessoa na jornada", await pg.input_value(f"#s-reg-{eid}") == f"j:{jid}")
        await pg.locator("tr", has=pg.locator(f"#s-reg-{eid}")).get_by_role("button", name="mais detalhes").click(); await pg.wait_for_timeout(400)
        res = await pg.inner_text(f"#s-jornada-{eid}")
        check("Detalhes: resumo da jornada", "Escala Teste" in res and "7h30 de trabalho" in res, res)
        check("Detalhes: 30h por semana no contrato", await pg.input_value(f"#s-contract-{eid}") == "30h")
        # escala: 4 dias de trabalho na semana, 7h30 cada (com intervalo de 1h ou do turno)
        await go("escala")
        row = pg.locator("tr", has=pg.locator("th", has_text=nome)).first
        txt = await row.inner_text()
        hor = re.findall(r"(\d\d:\d\d)[–-](\d\d:\d\d)", txt)
        check("Escala: nome da jornada sob o nome", "Escala Teste" in txt, txt[:100])
        check("Escala: 4 dias de trabalho na semana", len(hor) == 4, hor)
        # setor inteiro na jornada Meio período
        await go("equipe")
        sid = await pg.get_attribute("[data-modelo-setor]", "data-modelo-setor")
        mid = [v for v in await pg.eval_on_selector(f"#modelo-setor-{sid}", "s=>[...s.options].map(o=>o.value+'|'+o.textContent)") if "Meio" in v][0].split("|")[0]
        await pg.select_option(f"#modelo-setor-{sid}", mid); await pg.wait_for_timeout(300)
        await pg.click(f"#modelo-setor-aplicar-{sid}"); await pg.wait_for_timeout(1500)
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Setor inteiro em Meio período", regs and all(v == mid for v in regs), regs[:5])
        # pessoa nova no setor entra na jornada
        await pg.get_by_role("button", name="+ Pessoa").click(); await pg.wait_for_timeout(1000)
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Pessoa nova segue a jornada do setor", all(v == mid for v in regs), regs[-3:])
        # excluir a jornada: todos voltam ao 5x2
        await go("personalizar")
        await pg.locator("#jornadas").scroll_into_view_if_needed()
        row = pg.locator(f"#jornadas-editor [data-jornada='{mid[2:]}']")
        await row.get_by_role("button", name="Excluir").click(); await pg.wait_for_timeout(200)
        await row.get_by_role("button", name=re.compile("^Excluir \\(")).click(); await pg.wait_for_timeout(1200)
        check("Jornada excluída", await pg.locator("#jornadas-editor [data-jornada]").count() == 1)
        await go("equipe")
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Depois de excluir: todos no regime da loja", all(v == "f2" for v in regs), regs[:5])
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
