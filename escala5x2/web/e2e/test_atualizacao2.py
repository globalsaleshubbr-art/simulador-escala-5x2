# Relatório "Atualização 2.0": 6x1/5x2 por pessoa e por setor, turno com horas próprias (estágio 5h), domingo habitual.
import asyncio, os, re
from playwright.async_api import async_playwright

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))
h = lambda t: int(t[:2]) * 60 + int(t[3:])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1500, "height": 1000})
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(hh): await pg.evaluate(f"location.hash='{hh}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)

        # 3) turno de estágio com 5h
        await go("horarios")
        await pg.get_by_role("button", name="+ Turno", exact=True).click(); await pg.wait_for_timeout(700)
        sid_turno = (await pg.eval_on_selector_all("[id^='h-name-']", "els=>els.map(e=>e.id.slice(7))"))
        works = await pg.eval_on_selector_all("[id^='h-work-']:not([id^='h-work-info'])", "els=>els.map(e=>e.id.slice(7))")
        check("Horários: horas trabalhadas em todos os turnos", set(works) >= set(sid_turno) - set(), (len(works), len(sid_turno)))
        novo = [x for x in sid_turno if x in works][-1] if works else None
        # o turno novo é o último normal criado: renomeia e põe 5h
        normais = [x for x in sid_turno if await pg.locator(f"#h-work-info-{x}").count()]
        novo = normais[-1]
        await pg.fill(f"#h-name-{novo}", "Estágio Manhã"); await pg.press(f"#h-name-{novo}", "Tab")
        await pg.fill(f"#h-start-{novo}", "07:00"); await pg.press(f"#h-start-{novo}", "Tab"); await pg.wait_for_timeout(300)
        await pg.fill(f"#h-work-{novo}", "5h"); await pg.press(f"#h-work-{novo}", "Enter"); await pg.wait_for_timeout(500)
        await pg.select_option(f"#h-brkd-{novo}", "15"); await pg.wait_for_timeout(400)
        info = await pg.inner_text(f"#h-work-info-{novo}")
        check("Turno com horas próprias", "próprio do turno" in info, info)
        card = pg.locator("div.rounded-2xl", has=pg.locator(f"#h-work-{novo}")).first
        txt = await card.inner_text()
        check("Saída calculada com 5h + 15 min", "12:15" in txt, txt[-120:])
        check("Intervalo dentro do turno", h("07:00") < h(await pg.input_value(f"#h-win-s-{novo}")) + 60 and h(await pg.input_value(f"#h-win-e-{novo}")) - 60 < h("12:15"), (await pg.input_value(f"#h-win-s-{novo}"), await pg.input_value(f"#h-win-e-{novo}")))
        await card.screenshot(path=D + "turno_estagio.png")

        # 1) estagiário em 6x1 numa loja 5x2, no turno de estágio
        await go("equipe")
        ids = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.id.slice(6))")
        eid = ids[2]; nome = await pg.input_value(f"#s-name-{eid}")
        opts = await pg.eval_on_selector(f"#s-reg-{eid}", "s=>[...s.options].map(o=>o.value)")
        check("Regime por pessoa tem 5x2 e 6x1", "f2" in opts and "f1" in opts, opts)
        await pg.select_option(f"#s-ctr-{eid}", "estagio"); await pg.wait_for_timeout(600)
        await pg.select_option(f"#s-shift-{eid}", novo); await pg.wait_for_timeout(600)
        check("Estagiário segue as horas do turno (5h)", "5h" in await pg.inner_text(f"#s-hturno-{eid}"), await pg.locator(f"#s-hturno-{eid}").count())
        await pg.select_option(f"#s-reg-{eid}", "f1"); await pg.wait_for_timeout(1000)
        check("Estagiário em 6x1", await pg.input_value(f"#s-reg-{eid}") == "f1")
        check("Os outros continuam 5x2", await pg.input_value(f"#s-reg-{ids[0]}") == "f2")
        await go("escala")
        row = pg.locator("tr", has=pg.locator("th", has_text=nome)).first
        t = await row.inner_text()
        hor = re.findall(r"(\d\d:\d\d)[–-](\d\d:\d\d)", t)
        check("Escala: selo 6x1 sob o nome", "6x1" in t, t[:120])
        check("Escala: 6 dias na semana", len(hor) == 6, hor)
        check("Escala: dias de semana com 5h de trabalho (07:00–12:15)", sum(1 for a, b2 in hor if a == "07:00" and b2 == "12:15") >= 4, hor)
        check("Escala: semana com no máximo 30h", re.search(r"\b(30h|2\dh\d*|2\dh)\b", t) is not None, t[-30:])

        # 2) loja passa para 6x1, setor fica 5x2 (sem perder as opções)
        await go("personalizar")
        sid = await pg.get_attribute("#modelo-por-setor [data-modelo-setor]", "data-modelo-setor")
        await pg.select_option(f"#modelo-setor-{sid}", "f2"); await pg.click(f"#modelo-setor-aplicar-{sid}"); await pg.wait_for_timeout(1500)
        await pg.select_option("#f-model", "1"); await pg.wait_for_timeout(1000)
        opts = await pg.eval_on_selector(f"#modelo-setor-{sid}", "s=>[...s.options].map(o=>o.value)")
        check("Setor: 5x2 e 6x1 sempre disponíveis", "f2" in opts and "f1" in opts, opts)
        check("Setor continua 5x2 com a loja em 6x1", await pg.input_value(f"#modelo-setor-{sid}") == "f2")
        outros = await pg.eval_on_selector_all("#modelo-por-setor select", "els=>els.map(e=>e.value)")
        check("Outros setores seguem a loja", outros.count("loja") == len(outros) - 1, outros)
        await go("equipe")
        regs = await pg.eval_on_selector_all("[id^='s-reg-']", "els=>els.map(e=>e.value)")
        check("Pessoas do setor em 5x2 (aplicar no setor zerou exceções)", all(v == "f2" for v in regs), regs[:5])
        await pg.select_option(f"#s-reg-{eid}", "f1"); await pg.wait_for_timeout(800)
        check("Exceção 6x1 dentro do setor 5x2", await pg.input_value(f"#s-reg-{eid}") == "f1")
        await go("personalizar"); await pg.select_option("#f-model", "2"); await pg.wait_for_timeout(800)

        # 4) domingo habitual
        await go("domingos")
        pid = (await pg.eval_on_selector_all("[id^='dom-def-']", "els=>els.map(e=>e.id.slice(8))"))[0]
        cells = await pg.eval_on_selector_all(f"[id^='dom-{pid}-']", "els=>els.map(e=>e.id)")
        especiais = await pg.eval_on_selector(f"#dom-def-{pid}", "s=>[...s.options].map(o=>o.value).filter(v=>v!=='sector')")
        if len(especiais) < 2:
            await go("horarios"); await pg.get_by_role("button", name="+ Turno de domingo").click(); await pg.wait_for_timeout(700); await go("domingos")
            especiais = await pg.eval_on_selector(f"#dom-def-{pid}", "s=>[...s.options].map(o=>o.value).filter(v=>v!=='sector')")
        ab, fe = especiais[0], especiais[1]
        trabalha = [c for c in cells if await pg.input_value(f"#{c}") != "F"]
        for c in trabalha[:2]:
            await pg.select_option(f"#{c}", ab); await pg.wait_for_timeout(400)
        await pg.select_option(f"#dom-def-{pid}", fe); await pg.wait_for_timeout(900)
        vals = [await pg.input_value(f"#{c}") for c in trabalha[:2]]
        check("Domingo: trocar o habitual muda os domingos escolhidos à mão", all(v == "default" for v in vals), vals)
        check("Domingo: sem aviso de domingos fora do habitual", await pg.locator(f"#dom-fora-{pid}").count() == 0)
        # escolhe à mão de novo: aparece o aviso com o atalho
        if trabalha:
            await pg.select_option(f"#{trabalha[0]}", ab); await pg.wait_for_timeout(500)
            check("Domingo: aviso de domingo fora do habitual", await pg.locator(f"#dom-fora-{pid}").count() == 1)
            await pg.click(f"#dom-habitual-{pid}"); await pg.wait_for_timeout(600)
            check("Domingo: atalho volta ao habitual", await pg.input_value(f"#{trabalha[0]}") == "default")
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]

asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
