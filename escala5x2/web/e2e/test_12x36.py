# Escala 12x36 por pessoa em todas as telas.
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

        # Horários: seção de plantões, plantão noturno
        await go("horarios")
        check("Horários: seção Plantões 12x36", "Plantões 12x36" in await pg.inner_text("main"))
        await pg.click("#h-add-plantao-noite"); await pg.wait_for_timeout(600)
        txt = await pg.inner_text("main")
        check("Horários: plantão noite 19h às 7h do dia seguinte", "saída às 07:00 do dia seguinte" in txt)

        # Equipe: regime por pessoa
        await go("equipe")
        regs = pg.locator("[id^='s-reg-']")
        check("Equipe: coluna Regime", await regs.count() > 3)
        ids = [(await regs.nth(i).get_attribute("id")).replace("s-reg-", "") for i in range(3)]
        await pg.select_option(f"#s-reg-{ids[0]}", "A"); await pg.wait_for_timeout(800)
        await pg.select_option(f"#s-reg-{ids[1]}", "B"); await pg.wait_for_timeout(800)
        nome0 = await pg.input_value(f"#s-name-{ids[0]}")
        check("Equipe: domingos vira dia sim, dia não", "Dia sim, dia não" in await pg.inner_text(f"#s-sun-{ids[0]}"))
        opts = await pg.eval_on_selector(f"#s-shift-{ids[0]}", "s=>[...s.options].map(o=>o.textContent)")
        check("Equipe: turno só mostra plantões", all("Plantão" in o for o in opts) and len(opts) >= 1, opts)
        await pg.select_option(f"#s-shift-{ids[1]}", label=[o for o in await pg.eval_on_selector(f"#s-shift-{ids[1]}", "s=>[...s.options].map(o=>o.textContent)") if "noite" in o][0]); await pg.wait_for_timeout(800)
        await pg.select_option("#eq-regime", "12x36"); await pg.wait_for_timeout(400)
        check("Equipe: filtro de regime", "2 de" in await pg.inner_text("main"))
        await pg.select_option("#eq-regime", "all")

        # Escala da semana: dia sim, dia não, com selo
        await go("escala")
        row = pg.locator("tbody tr", has_text=nome0).first
        rt = await row.inner_text()
        check("Escala: selo 12x36 A", "12x36 A" in rt, rt[:80])
        labels = await row.locator("td button").all_inner_texts()
        folgas = [l for l in labels if "Folga" in l]
        check("Escala: alterna trabalho e folga", 3 <= len(folgas) <= 4 and len(labels) == 7, labels)
        alt = all(("Folga" in labels[i]) != ("Folga" in labels[i + 1]) for i in range(len(labels) - 1))
        check("Escala: nunca dois dias seguidos iguais", alt, labels)
        await pg.screenshot(path=D + "12x36-escala.png")
        # mês
        await go("mes")
        check("Mês: selo 12x36", "12x36 A" in await pg.inner_text("main"))
        # domingos e almoço
        await go("domingos")
        check("Domingos: selo 12x36", "12x36" in await pg.inner_text("main"))
        await go("almoco")
        check("Almoço: abre sem erro", "Escala de Almoço" in await pg.inner_text("main"))

        # importação com regime
        await go("equipe")
        await pg.click("#eq-importar"); await pg.wait_for_timeout(300)
        csv = "Nome;Regime\nVigia Teste;12x36 B\n".encode("utf-8")
        await pg.set_input_files("#imp-file", files=[{"name": "v.csv", "mimeType": "text/csv", "buffer": csv}]); await pg.wait_for_timeout(800)
        await pg.click("#imp-confirmar"); await pg.wait_for_timeout(1000)
        await pg.fill("#eq-q", "Vigia Teste"); await pg.wait_for_timeout(400)
        check("Importação: entra como 12x36 B", await pg.locator("[id^='s-reg-']").first.input_value() == "B")
        await pg.fill("#eq-q", "")

        # Personalizar explica onde fica
        await go("personalizar")
        check("Personalizar: explica 12x36 por setor e pessoa", "12x36 também pode ser escolhido por setor" in await pg.inner_text("main"))
        opts = await pg.eval_on_selector("#f-model", "s=>[...s.options].map(o=>o.textContent)")
        check("Modelo de escala tem 12x36", any("12x36" in o for o in opts), opts)
        await pg.select_option("#f-model", "12"); await pg.wait_for_timeout(500)
        check("12x36 pede confirmação", await pg.locator("#f-model-aplicar").count() == 1)
        await pg.click("#f-model-aplicar"); await pg.wait_for_timeout(1500)
        check("Modelo 12x36 aplicado", "dia sim, dia não" in await pg.inner_text("main"))
        await go("equipe")
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Equipe: todos em plantão A/B", regs and all(v in ("A", "B") for v in regs) and "A" in regs and "B" in regs, regs[:6])
        await go("escala")
        check("Escala: subtítulo 12x36", "12x36 (dia sim, dia não)" in await pg.inner_text("main"))
        await go("personalizar")
        await pg.select_option("#f-model", "2"); await pg.wait_for_timeout(500)
        await pg.click("#f-model-aplicar"); await pg.wait_for_timeout(1500)
        await go("equipe")
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Voltar para 5x2: todos no regime da loja", regs and all(v == "f2" for v in regs), regs[:6])

        # Por setor: só o setor atual vai para 12x36
        sid = await pg.get_attribute("[data-modelo-setor]", "data-modelo-setor")
        await pg.select_option(f"#modelo-setor-{sid}", "12x36"); await pg.wait_for_timeout(400)
        check("Equipe: setor pede confirmação", await pg.locator(f"#modelo-setor-aplicar-{sid}").count() == 1)
        await pg.click(f"#modelo-setor-aplicar-{sid}"); await pg.wait_for_timeout(1500)
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Equipe: setor inteiro em plantão A/B", regs and all(v in ("A", "B") for v in regs), regs[:6])
        await go("personalizar")
        vals = await pg.eval_on_selector_all("#modelo-por-setor select", "els=>els.map(e=>e.value)")
        check("Personalizar: só um setor em 12x36", vals.count("12x36") == 1 and len(vals) > 1, vals)
        check("Personalizar: loja continua 5x2", await pg.input_value("#f-model") == "2")
        await go("escala")
        check("Escala: subtítulo do setor 12x36", "12x36 (dia sim, dia não)" in await pg.inner_text("main"))
        # outro setor pela lista de Personalizar
        await go("personalizar")
        outro = await pg.eval_on_selector_all("#modelo-por-setor [data-modelo-setor]", "els=>els.map(e=>e.dataset.modeloSetor)")
        outro = [x for x in outro if x != sid][0]
        await pg.select_option(f"#modelo-setor-{outro}", "12x36"); await pg.click(f"#modelo-setor-aplicar-{outro}"); await pg.wait_for_timeout(1500)
        vals = await pg.eval_on_selector_all("#modelo-por-setor select", "els=>els.map(e=>e.value)")
        check("Personalizar: segundo setor em 12x36", vals.count("12x36") == 2, vals)
        await pg.select_option(f"#modelo-setor-{sid}", "loja"); await pg.click(f"#modelo-setor-aplicar-{sid}"); await pg.wait_for_timeout(1500)
        vals = await pg.eval_on_selector_all("#modelo-por-setor select", "els=>els.map(e=>e.value)")
        check("Personalizar: setor volta para 5x2", vals.count("12x36") == 1, vals)
        # exportação Excel tem a coluna Regime
        await go("escala")
        btn = pg.get_by_role("button", name=re.compile("Excel"))
        if await btn.count():
            async with pg.expect_download() as dl:
                await btn.first.click()
            path = await (await dl.value).path()
            check("Excel exportado", open(path, "rb").read(2) == b"PK")
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
