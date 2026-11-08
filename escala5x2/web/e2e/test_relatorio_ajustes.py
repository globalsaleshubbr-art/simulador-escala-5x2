# Relatório de ajustes do programa de escalas (itens 01 a 06), testado na versão simples.
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
        ctx = await b.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        async def toast(): return await pg.inner_text("body")
        await pg.goto(URL); await pg.wait_for_timeout(4000)

        # ---------------- 01 folga fixa no domingo
        await go("equipe")
        sel = pg.locator("[id^='s-fix-']").first
        sid = await sel.get_attribute("id"); eid = sid.replace("s-fix-", "")
        opts = await sel.evaluate("s=>[...s.options].map(o=>o.textContent)")
        check("01 · folga fixa oferece domingo", any(o.startswith("Dom") for o in opts), opts)
        await sel.select_option("0"); await pg.wait_for_timeout(700)
        check("01 · domingos vira 'Folga fixa no domingo'", await pg.eval_on_selector(f"#s-sun-{eid}", "s=>s.options[s.selectedIndex].textContent") == "Folga fixa no domingo")
        nome = await pg.input_value(f"#s-name-{eid}") or await pg.get_attribute(f"#s-name-{eid}", "placeholder")
        await go("domingos"); await pg.wait_for_timeout(500)
        txt = await pg.inner_text("main")
        check("01 · pessoa com folga fixa no domingo está de folga nos domingos", nome in txt)
        # filtro + alteração em grupo (ex.: estagiários)
        await go("equipe")
        await pg.select_option("#eq-folga", "0"); await pg.wait_for_timeout(400)
        check("01 · filtro por folga fixa no domingo", "1 de" in await pg.inner_text("main"))
        await pg.select_option("#eq-folga", "all")

        # ---------------- 02 regra de domingo 2x1 com prévia
        await go("personalizar")
        await pg.select_option("#regra-dom-loja", "2"); await pg.wait_for_timeout(600)
        prev = pg.get_by_role("region", name="Prévia da regra de domingo")
        check("02 · prévia aparece antes de aplicar", await prev.count() == 1)
        pt = await prev.inner_text()
        check("02 · prévia mostra domingos, folga por time e contagem", "Trabalham" in pt and "folga A" in pt.replace("\n", " ") or "folga" in pt, pt[:200])
        await pg.screenshot(path=D + "relatorio-02-previa.png", full_page=False)
        await pg.click("#regra-dom-aplicar"); await pg.wait_for_timeout(1500)
        check("02 · regra aplicada", "2x1" in await toast())
        await go("equipe")
        card = await pg.inner_text("#sun-teams")
        check("02 · equipe dividida em 3 times", "Time C" in card and "rodízio 2x1" in card, card[:200])
        # regra própria do setor (1x1) com a loja em 2x1
        secsel = pg.locator("[id^='regra-dom-sec_'], [id^='regra-dom-']").filter(has_not=pg.locator("#regra-dom-loja")).first
        rid = await pg.locator("#sun-teams [id^='regra-dom-']").first.get_attribute("id")
        await pg.select_option("#" + rid, "1"); await pg.wait_for_timeout(500)
        await pg.click("#sun-teams [id^='regra-dom-aplicar-']"); await pg.wait_for_timeout(1500)
        card = await pg.inner_text("#sun-teams")
        check("02 · setor com regra própria 1x1", "rodízio 1x1" in card and "Regra própria" in card, card[:200])

        # ---------------- 03 aplicar sugestão de intervalos num domingo
        # domingo como no relatório: 08:30–16:30 com 1h de intervalo
        await go("personalizar")
        await pg.fill("#f-sun-open", "08:30"); await pg.fill("#f-sun-close", "16:30"); await pg.wait_for_timeout(500)
        await go("horarios")
        # turno de domingo: o que não tem a nota "jornada da loja / próprio do turno"
        wids = await pg.eval_on_selector_all("[id^='h-work-']:not([id^='h-work-info'])", "els=>els.map(e=>e.id.slice(7))")
        wid = [w for w in wids if not await pg.locator(f"#h-work-info-{w}").count()][0]
        await pg.fill(f"#h-start-{wid}", "08:30")
        await pg.fill(f"#h-work-{wid}", "7h"); await pg.press(f"#h-work-{wid}", "Enter")
        await pg.select_option(f"#h-brkd-{wid}", "60"); await pg.wait_for_timeout(300)
        await pg.fill(f"#h-win-s-{wid}", "11:00"); await pg.wait_for_timeout(300)
        await pg.fill(f"#h-win-e-{wid}", "14:00"); await pg.wait_for_timeout(800)
        await go("almoco")
        sunday = await pg.evaluate("""() => { const d = new Date(document.querySelector('#alm-date').value + 'T12:00:00'); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d.toISOString().slice(0,10); }""")
        await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(500)
        await pg.fill("#alm-date", sunday); await pg.wait_for_timeout(1500)
        cels = pg.locator("button[id^='alm-dia-']")
        n = await cels.count()
        check("03 · domingo com almoços (turno de domingo com intervalo)", n >= 2, n)
        horas = [await cels.nth(i).get_attribute("data-alm") for i in range(n)]
        check("03 · domingo: almoços espalhados no horário do intervalo", len(set(horas)) >= 2 and all("11:00" <= h <= "13:00" for h in horas), horas)
        # muda um só neste domingo
        iid = await cels.nth(0).get_attribute("id")
        await cels.nth(0).click(); await pg.wait_for_timeout(300)
        ed = pg.locator("[id^='alm-ed-']").first
        await ed.locator("input").fill("13:00"); await ed.locator("[id$='-salvar']").click(); await pg.wait_for_timeout(1000)
        check("03 · mudou só neste dia", await pg.get_attribute("#"+iid, "data-alm") == "13:00" and await pg.get_attribute("#"+iid, "data-manual") == "1")
        await pg.screenshot(path=D + "relatorio-03-domingo.png", full_page=False)
        await pg.reload(); await pg.wait_for_timeout(3500); await go("almoco"); await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(500)
        await pg.fill("#alm-date", sunday); await pg.wait_for_timeout(1200)
        check("03 · continua salvo depois de atualizar a tela", await pg.get_attribute("#"+iid, "data-alm") == "13:00")

        # ---------------- 06 cobertura: chegadas, saídas e saldo
        body = await pg.inner_text("[id^='alm-']:has(table)")
        check("06 · linhas No posto / Almoçando / Mínimo / Sobra-falta", all(k in body for k in ["No posto", "Almoçando", "Mínimo", "Sobra / falta"]))

        # ---------------- 04 horário da loja para os setores
        await go("personalizar")
        await pg.fill("#f-open", "07:00"); await pg.wait_for_timeout(600)
        reg = pg.get_by_role("region", name="Horário dos setores")
        check("04 · avisa setores com horário diferente", await reg.count() == 1)
        await pg.click("#horario-setores-revisar"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=D + "relatorio-04-horarios.png", full_page=False)
        await pg.click("#horario-setores-aplicar"); await pg.wait_for_timeout(1000)
        check("04 · horário aplicado aos setores", "Horário da loja aplicado" in await toast())
        await go("necessidade")
        check("04 · necessidade começa 07:00", await pg.locator("input[id^='n-s-']").first.input_value() == "07:00")

        # ---------------- 05 importar por planilha (modelo Excel e CSV)
        await go("equipe")
        await pg.click("#eq-importar"); await pg.wait_for_timeout(400)
        async with pg.expect_download() as dl:
            await pg.get_by_role("button", name="Baixar modelo (Excel)").click()
        path = await (await dl.value).path()
        check("05 · modelo .xlsx baixado", open(path, "rb").read(2) == b"PK")
        await pg.set_input_files("#imp-file", files=[{"name": "modelo.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "buffer": open(path, "rb").read()}])
        await pg.wait_for_timeout(1500)
        prev = await pg.inner_text("[aria-label='Prévia da importação']")
        check("05 · prévia do modelo com 2 novas", re.search(r"2\s+novas", prev) is not None, prev[:200])
        csv = "Nome;Matrícula;Função;Setor;Turno;Domingos;Folga fixa\nEstagiário Teste;7777;Estagiário;;;Não trabalha;Dom\nSem Setor;7778;Op;Açougue Lunar;;;\n".encode("utf-8")
        await pg.set_input_files("#imp-file", files=[{"name": "lista.csv", "mimeType": "text/csv", "buffer": csv}])
        await pg.wait_for_timeout(1000)
        prev = await pg.inner_text("[aria-label='Prévia da importação']")
        check("05 · erro por linha com motivo", "Açougue Lunar" in prev and "não existe" in prev, prev[:300])
        await pg.click("#imp-confirmar"); await pg.wait_for_timeout(1200)
        check("05 · importação concluída", "1 pessoa cadastrada" in await toast())
        await pg.fill("#eq-q", "Estagiário Teste"); await pg.wait_for_timeout(500)
        check("05 · pessoa importada com folga fixa no domingo", await pg.locator("[id^='s-fix-']").first.input_value() == "0")

        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
