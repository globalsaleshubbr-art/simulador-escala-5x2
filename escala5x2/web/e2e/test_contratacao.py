# Contratação: estagiário / jovem aprendiz com horas por dia editáveis.
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
        ctx = await b.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)
        await go("equipe")
        ids = await pg.eval_on_selector_all("[id^='s-ctr-']", "els=>els.map(e=>e.id.slice(6))")
        check("Equipe: coluna Contratação", len(ids) > 3, len(ids))
        eid = ids[0]
        nome = await pg.input_value(f"#s-name-{eid}")
        await pg.select_option(f"#s-ctr-{eid}", "estagio"); await pg.wait_for_timeout(800)
        check("Estagiário: campo de horas por dia com 6h", await pg.input_value(f"#s-hdia-{eid}") == "6h", await pg.input_value(f"#s-hdia-{eid}"))
        # editar as horas: 5h
        await pg.fill(f"#s-hdia-{eid}", "5"); await pg.press(f"#s-hdia-{eid}", "Enter"); await pg.wait_for_timeout(800)
        check("Horas por dia editadas", await pg.input_value(f"#s-hdia-{eid}") == "5h", await pg.input_value(f"#s-hdia-{eid}"))
        # detalhes: semana, intervalo e resumo
        await pg.locator("tr", has=pg.locator(f"#s-ctr-{eid}")).get_by_role("button", name="mais detalhes").click(); await pg.wait_for_timeout(500)
        check("Detalhes: horas por semana 30h", await pg.input_value(f"#s-contract-{eid}") == "30h", await pg.input_value(f"#s-contract-{eid}"))
        resumo = await pg.inner_text(f"#s-jornada-{eid}")
        check("Resumo: 5h de trabalho e 15 min de intervalo", "5h de trabalho" in resumo and "intervalo das" in resumo, resumo)
        check("Resumo: cita a Lei do Estágio", "11.788" in resumo)
        await pg.select_option(f"#s-int-{eid}", "0"); await pg.wait_for_timeout(600)
        check("Intervalo: sem intervalo", "sem intervalo" in await pg.inner_text(f"#s-jornada-{eid}"))
        m = re.search(r"entra às (\d\d:\d\d).*sai às (\d\d:\d\d)", (await pg.inner_text(f"#s-jornada-{eid}")).replace("\n", " "))
        h = lambda t: int(t[:2]) * 60 + int(t[3:])
        check("Sai 5h depois de entrar", m and h(m.group(2)) - h(m.group(1)) == 300, m and m.groups())
        await pg.screenshot(path=D + "contratacao_equipe.png", full_page=False)
        # filtro de contratação
        await pg.select_option("#eq-contr", "estagio"); await pg.wait_for_timeout(400)
        check("Filtro: só estagiários", await pg.locator("[id^='s-ctr-']").count() == 1)
        await pg.select_option("#eq-contr", "all")
        # escala: selo e horário com a saída nova
        await go("escala")
        row = pg.locator("tr", has=pg.locator("th", has_text=nome)).first
        txt = await row.inner_text()
        check("Escala: selo Estágio 5h", "Estágio 5h" in txt, txt[:120])
        horarios = re.findall(r"(\d\d:\d\d)[–-](\d\d:\d\d)", txt)
        difs = [h(b2) - h(a2) for a2, b2 in horarios]
        check("Escala: dias de semana com 5h (domingo não passa do turno de domingo)", difs and difs.count(300) >= 3 and all(d <= 300 for d in difs), horarios)
        # voltar para CLT
        await go("equipe")
        await pg.select_option(f"#s-ctr-{eid}", "clt"); await pg.wait_for_timeout(800)
        check("CLT: sem campo de horas por dia", await pg.locator(f"#s-hdia-{eid}").count() == 0)
        # importação com colunas novas
        await pg.click("#eq-importar"); await pg.wait_for_timeout(500)
        csv = "Nome;Contratação;Horas por dia\nAprendiz Teste;Jovem aprendiz;4\n".encode("utf-8")
        await pg.set_input_files("#imp-file", files=[{"name": "a.csv", "mimeType": "text/csv", "buffer": csv}]); await pg.wait_for_timeout(800)
        await pg.click("#imp-confirmar"); await pg.wait_for_timeout(1000)
        await pg.fill("#eq-q", "Aprendiz Teste"); await pg.wait_for_timeout(400)
        check("Importação: aprendiz com 4h", await pg.locator("[id^='s-ctr-']").first.input_value() == "aprendiz" and await pg.locator("[id^='s-hdia-']").first.input_value() == "4h")
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
