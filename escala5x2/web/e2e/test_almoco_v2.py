# Escala de almoço (modelo 2): horário fixo sugerido por pessoa, rodízio opcional,
# mudança "só neste dia" que o sistema não desfaz, as duas visões (Semana e Dia) com os mesmos controles.
import asyncio, os
from playwright.async_api import async_playwright
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL = os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok = []; fail = []
def check(n, c, i=""): (ok if c else fail).append(n + ("" if c else f" [{i}]"))

# por linha: id da pessoa, nome, horário fixo e os almoços de cada dia da tabela
LER = """t=>[...t.querySelectorAll('tbody tr[data-pessoa]')].map(r=>({id:r.dataset.pessoa,
  nome:(r.querySelector('th')||{}).textContent||'',
  hora:(r.querySelector('input[id^=alm-hora-]')||{}).value||null,
  rod:!!r.querySelector('[id$=-rodizio][aria-checked=true]'),
  dias:[...r.querySelectorAll('button[data-alm]')].map(b=>({d:b.dataset.dia,h:b.dataset.alm,m:b.dataset.manual==='1',f:b.dataset.fora==='1'}))}))"""

def mins(h): a, b = map(int, h.split(":")); return a * 60 + b

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(1500)
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(5500)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        check("abre na visão Semana", await pg.get_attribute("#alm-ver-semana", "aria-checked") == "true" and await tab.count() == 1)
        resumo = await pg.locator("[id^=alm-resumo-]").first.inner_text()
        check("resumo: horário fixo / rodízio / almoçando juntos", "com horário fixo" in resumo and "ao mesmo tempo" in resumo, resumo)
        linhas = await tab.evaluate(LER)
        check("lista as pessoas do setor", len(linhas) >= 5, len(linhas))
        fixos = [x for x in linhas if x["hora"] and not x["rod"]]
        check("todo mundo começa com horário fixo sugerido", len(fixos) == len(linhas), [x["nome"] for x in linhas if not x["hora"]][:3])
        # mesma hora em todos os dias normais (fora domingo, que é distribuído no dia)
        def repete(x):
            hs = {c["h"] for c in x["dias"] if c["h"] and not c["m"] and not c["d"] in domingos}
            return not hs or hs == {x["hora"]}
        domingos = await pg.evaluate("""()=>[...document.querySelectorAll('button[data-dia]')].map(b=>b.dataset.dia).filter(d=>new Date(d+'T12:00').getDay()===0)""")
        check("horário fixo se repete na semana", all(repete(x) for x in fixos), [(x["nome"], x["hora"], x["dias"]) for x in fixos if not repete(x)][:2])
        check("nenhum almoço fora do horário do intervalo", not any(c["f"] for x in linhas for c in x["dias"]))
        # almoços espalhados: não ficam todos no mesmo horário
        check("sugestão espalha os horários", len({x["hora"] for x in fixos}) >= 2, {x["hora"] for x in fixos})
        await pg.screenshot(path=D + "almoco_v2_semana.png", full_page=False)

        # ----- muda o horário fixo de uma pessoa
        alvo = fixos[1]; pid = alvo["id"]
        h0 = alvo["hora"]; nv = f"{(mins(h0) + 30) // 60:02d}:{(mins(h0) + 30) % 60:02d}"
        await pg.fill(f"#alm-hora-{pid}", nv); await pg.wait_for_timeout(1800)
        r = [x for x in await tab.evaluate(LER) if x["id"] == pid][0]
        check("novo horário fixo vale em todos os dias normais", r["hora"] == nv and all(c["h"] == nv for c in r["dias"] if c["d"] not in domingos), r["dias"])
        aviso = pg.locator(f"#alm-aviso-{pid}")
        check("horário dentro do intervalo: sem aviso", await aviso.count() == 0 or "Fora" not in await aviso.inner_text())
        # gerar a escala de novo não mexe no horário escolhido
        await go("escala")
        gerar = pg.get_by_role("button", name="Gerar escala").first
        if await gerar.count():
            await gerar.click(); await pg.wait_for_timeout(9000)
        await go("almoco")
        check("depois de Gerar escala o horário continua", await pg.input_value(f"#alm-hora-{pid}") == nv, await pg.input_value(f"#alm-hora-{pid}"))
        await pg.reload(); await pg.wait_for_timeout(5000)
        check("horário fixo gravado após recarregar", await pg.input_value(f"#alm-hora-{pid}") == nv)

        # ----- muda só um dia
        tab = pg.locator("[id^=alm-semana-tab-]").first
        r = [x for x in await tab.evaluate(LER) if x["id"] == pid][0]
        dia = [c for c in r["dias"] if c["h"] and c["d"] not in domingos][0]["d"]
        cel = f"#alm-dia-{pid}-{dia}"
        await pg.click(cel); await pg.wait_for_timeout(300)
        ed = f"#alm-ed-{pid}-{dia}"
        check("clicar no dia abre o editor", await pg.locator(ed).count() == 1)
        um = f"{(mins(nv) + 60) // 60:02d}:{(mins(nv) + 60) % 60:02d}"
        um = um if mins(um) <= mins("14:00") else f"{(mins(nv) - 60) // 60:02d}:{(mins(nv) - 60) % 60:02d}"
        await pg.locator(ed + " input").fill(um); await pg.click(ed + "-salvar"); await pg.wait_for_timeout(1500)
        check("só neste dia: muda a célula e marca 'só hoje'", await pg.get_attribute(cel, "data-alm") == um and await pg.get_attribute(cel, "data-manual") == "1")
        r = [x for x in await tab.evaluate(LER) if x["id"] == pid][0]
        check("só neste dia: os outros dias ficam no fixo", all(c["h"] == nv for c in r["dias"] if c["d"] not in domingos and c["d"] != dia), r["dias"])
        # recalcular todos não desfaz o "só neste dia"
        await pg.get_by_role("button", name="Sugerir horários de novo").first.click(); await pg.wait_for_timeout(300)
        await pg.get_by_role("button", name="Recalcular todos").first.click(); await pg.wait_for_timeout(2000)
        check("Sugerir de novo mantém o 'só neste dia'", await pg.get_attribute(cel, "data-alm") == um and await pg.get_attribute(cel, "data-manual") == "1")
        await pg.reload(); await pg.wait_for_timeout(5000)
        check("'só neste dia' gravado após recarregar", await pg.get_attribute(cel, "data-alm") == um)
        # voltar ao horário de sempre
        await pg.click(cel); await pg.wait_for_timeout(300)
        await pg.click(ed + "-voltar"); await pg.wait_for_timeout(1500)
        fixo_agora = await pg.input_value(f"#alm-hora-{pid}")
        check("↺ volta ao horário fixo", await pg.get_attribute(cel, "data-manual") is None and await pg.get_attribute(cel, "data-alm") == fixo_agora)

        # ----- rodízio
        tab = pg.locator("[id^=alm-semana-tab-]").first
        await pg.click(f"#alm-modo-{pid}-rodizio"); await pg.wait_for_timeout(1800)
        r = [x for x in await tab.evaluate(LER) if x["id"] == pid][0]
        check("rodízio: some o campo de hora fixa", r["rod"] and not r["hora"])
        hs = [c["h"] for c in r["dias"] if c["h"]]
        check("rodízio: ainda tem almoço todo dia de trabalho", len(hs) >= 3, hs)
        resumo = await pg.locator("[id^=alm-resumo-]").first.inner_text()
        check("resumo conta quem está em rodízio", "1 em rodízio" in resumo, resumo)
        await pg.click(f"#alm-modo-{pid}-fixo"); await pg.wait_for_timeout(1800)
        check("voltar ao fixo traz o campo de hora", await pg.locator(f"#alm-hora-{pid}").count() == 1)

        # ----- tempo de almoço de cada pessoa
        def fim_turno(txt):
            import re as _re
            m = _re.search(r"(\d\d:\d\d)–(\d\d:\d\d)", txt); return m.group(2) if m else None
        th0 = await pg.locator(f"tr[data-pessoa='{pid}'] th").inner_text()
        ate0 = await pg.locator(f"tr[data-pessoa='{pid}'] td").first.inner_text()
        check("tempo de almoço: começa no do turno", "(turno)" in (await pg.locator(f"#alm-dur-{pid} option:checked").inner_text()))
        await pg.select_option(f"#alm-dur-{pid}", "90"); await pg.wait_for_timeout(1500)
        h = await pg.input_value(f"#alm-hora-{pid}")
        ate = (await pg.locator(f"tr[data-pessoa='{pid}'] td").first.inner_text())
        check("tempo de almoço 1h30: 'até' anda junto", f"até {(mins(h)+90)//60:02d}:{(mins(h)+90)%60:02d}" in ate, ate)
        th1 = await pg.locator(f"tr[data-pessoa='{pid}'] th").inner_text()
        f0, f1 = fim_turno(th0), fim_turno(th1)
        def trabalho(txt):
            import re as _re
            m = _re.search(r"(\d\d:\d\d)–(\d\d:\d\d) · (?:(\d+)h(\d\d)?|(\d+) min)", txt)
            dur = int(m.group(5)) if m.group(5) else int(m.group(3)) * 60 + int(m.group(4) or 0)
            return mins(m.group(2)) - mins(m.group(1)) - dur, dur
        w0, d0_ = trabalho(th0); w1, d1_ = trabalho(th1)
        check("a saída anda junto (mesmas horas de trabalho)", w0 == w1 and d1_ == 90, (th0, th1))
        check("aviso na tela", "1h30" in await pg.inner_text("body"))
        await pg.select_option(f"#alm-dur-{pid}", "150"); await pg.wait_for_timeout(1200)
        av = await pg.locator(f"#alm-dur-aviso-{pid}").inner_text() if await pg.locator(f"#alm-dur-aviso-{pid}").count() else ""
        check("acima do máximo da loja: avisa (grava mesmo assim)", "máximo" in av and await pg.input_value(f"#alm-dur-{pid}") == "150", av)
        await pg.select_option(f"#alm-dur-{pid}", "45"); await pg.wait_for_timeout(1200)
        await pg.reload(); await pg.wait_for_timeout(5000)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        check("tempo de almoço gravado após recarregar", await pg.input_value(f"#alm-dur-{pid}") == "45")
        await pg.select_option(f"#alm-dur-{pid}", ""); await pg.wait_for_timeout(1200)
        check("voltar ao tempo do turno", "(turno)" in (await pg.locator(f"#alm-dur-{pid} option:checked").inner_text()) and fim_turno(await pg.locator(f"tr[data-pessoa='{pid}'] th").inner_text()) == f0)

        # ----- ordem crescente/decrescente
        await pg.select_option("#alm-ordem", "nome"); await pg.wait_for_timeout(500)
        n1 = [x["nome"] for x in await tab.evaluate(LER)]
        await pg.click("#alm-ordem-dir"); await pg.wait_for_timeout(500)
        n2 = [x["nome"] for x in await tab.evaluate(LER)]
        check("decrescente inverte a lista", n2 == n1[::-1], (n1[:3], n2[:3]))
        await pg.click("#alm-ordem-dir"); await pg.wait_for_timeout(300)

        # ----- visão Dia
        await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(1000)
        dtab = pg.locator("[id^=alm-dia-tab-]").first
        check("visão Dia mostra a tabela do dia", await dtab.count() == 1)
        dl = await dtab.evaluate(LER)
        check("visão Dia tem os mesmos controles (fixo/rodízio e hora)", len(dl) >= 3 and [await pg.locator(f"#alm-modo-{x['id']}").count() for x in dl[:3]] == [1, 1, 1] and sum(1 for x in dl if x["hora"]) >= 3, len(dl))
        corpo = await dtab.inner_text()
        check("visão Dia: linhas No posto / Almoçando / Mínimo / Sobra-falta", all(k in corpo for k in ["No posto", "Almoçando", "Mínimo", "Sobra / falta"]))
        # a grade cobre o dia inteiro: a tabela cabe na rolagem do quadro, sem cortar
        larg = await dtab.evaluate("t=>({t:t.scrollWidth, p:t.parentElement.scrollWidth})")
        check("grade do dia inteira dentro do quadro", larg["t"] <= larg["p"] + 1, larg)
        await pg.screenshot(path=D + "almoco_v2_dia.png", full_page=False)
        await pg.get_by_role("button", name="Próximo dia").click(); await pg.wait_for_timeout(600)
        check("navega entre dias", await pg.locator("[id^=alm-dia-tab-]").count() == 1)

        # ----- celular
        await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(600)
        for v in ["dia", "semana"]:
            await pg.click(f"#alm-ver-{v}"); await pg.wait_for_timeout(700)
            over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
            check(f"celular ({v}) sem rolagem lateral da página", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
