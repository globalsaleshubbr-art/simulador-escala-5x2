# Escala de Almoço: gráfico do dia (almoçando, no posto, mínimo) e almoço próprio do domingo por pessoa
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        # relógio fixo num dia do período da demonstração, às 14:00 (para ver o "agora")
        import datetime
        await pg.clock.install(time=datetime.datetime(2026, 11, 10, 14, 0, 0))
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(5500)
        # ---- gráfico: pessoas na loja
        g = pg.locator("[id^=alm-graf-]").filter(has=pg.locator("svg")).first
        check("gráfico na tela", await g.count() == 1)
        ordem = await pg.evaluate("()=>{const g=document.querySelector('[id^=alm-graf-]').getBoundingClientRect().top;const t=document.querySelector('[id^=alm-semana-tab-]').getBoundingClientRect().top;return t<g}")
        check("gráfico embaixo da escala de almoço", ordem)
        check("gráfico do setor escolhido", "Pessoas trabalhando · Frente de Caixa" in await g.inner_text())
        check("botão 'Ver agora (hoje)' quando hoje não está na tela", await pg.locator("[id^=alm-graf-hoje-]").count() == 1)
        await pg.locator("[id^=alm-graf-hoje-]").first.click(); await pg.wait_for_timeout(1500)
        check("vai para a semana de hoje", await pg.input_value("#alm-date") == "2026-11-10")
        res = await pg.locator("[id^=alm-graf-resumo-]").first.inner_text()
        check("hoje: ao vivo, com quantas pessoas agora", "ao vivo" in res.lower() and "Agora (14:00)" in res and "trabalhando" in res, res)
        check("linha do 'agora' no gráfico", "agora" in (await g.locator("svg").text_content() or ""))
        box = await g.locator("svg").bounding_box()
        await pg.mouse.move(box["x"] + box["width"] * 0.3, box["y"] + 100); await pg.wait_for_timeout(300)
        dica = await pg.locator("[id^=alm-graf-dica-]").inner_text() if await pg.locator("[id^=alm-graf-dica-]").count() else ""
        check("passar o mouse: total e por turno", "trabalhando" in dica and "Açougue" not in dica and len(dica.splitlines()) >= 3, dica)
        # trocar de setor: o gráfico acompanha
        await pg.locator("[role=tablist][aria-label=Setores] [role=tab]", has_text="Padaria").first.click(); await pg.wait_for_timeout(1500)
        check("trocar o setor troca o gráfico", "Pessoas trabalhando · Padaria" in await pg.locator("[id^=alm-graf-]").first.inner_text())
        await pg.locator("[role=tablist][aria-label=Setores] [role=tab]", has_text="Frente de Caixa").first.click(); await pg.wait_for_timeout(1500)
        g = pg.locator("[id^=alm-graf-]").filter(has=pg.locator("svg")).first
        await g.screenshot(path=D + "almoco_grafico.png")
        chips = g.locator("[role=radio]")
        check("semana: um botão por dia", await chips.count() == 7, await chips.count())
        await chips.nth(0).click(); await pg.wait_for_timeout(400)
        res2 = await pg.locator("[id^=alm-graf-resumo-]").first.inner_text()
        check("outro dia: mostra o pico (sem 'agora')", "Pico" in res2 and "ao vivo" not in res2.lower(), res2)
        # o relógio anda: o "agora" se atualiza sozinho
        await chips.nth(1).click(); await pg.wait_for_timeout(300)
        await pg.clock.run_for(5 * 60 * 1000); await pg.wait_for_timeout(400)
        res3 = await pg.locator("[id^=alm-graf-resumo-]").first.inner_text()
        check("tempo real: o 'agora' anda sozinho", "Agora (14:05)" in res3, res3)
        # ---- domingo por pessoa
        dur = pg.locator("select[id^='alm-dom-dur-']")
        check("almoço de domingo por pessoa", await dur.count() >= 3, await dur.count())
        pid = (await dur.first.get_attribute("id"))[len("alm-dom-dur-"):]
        doms = await pg.evaluate(f"()=>[...document.querySelectorAll('[id^=alm-dia-{pid}-],tr[data-pessoa=\"{pid}\"] td')].length")
        # acha um domingo em que a pessoa trabalha (anda as semanas)
        dom = None
        for _ in range(6):
            dom = await pg.evaluate(f"()=>{{const ds=[...document.querySelectorAll('[id^=alm-semana-tab-] thead th')].map(t=>t.textContent);const r=document.querySelector('tr[data-pessoa=\"{pid}\"]');if(!r)return null;const tds=[...r.querySelectorAll('td')];const c=tds[tds.length-1];return c.textContent.includes('Folga')?null:c.textContent}}")
            if dom: break
            await pg.get_by_role("button", name="Próxima semana").click(); await pg.wait_for_timeout(800)
        check("domingo trabalhado sem almoço (turno de domingo sem intervalo)", dom is not None and "Sem almoço" in dom, dom)
        await pg.select_option(f"#alm-dom-dur-{pid}", "60"); await pg.wait_for_timeout(1500)
        sun = pg.locator(f"tr[data-pessoa='{pid}'] td").last.locator("button[data-alm]")
        check("tempo no domingo cria o almoço do domingo", await sun.count() == 1, await pg.locator(f"tr[data-pessoa='{pid}'] td").last.inner_text())
        await pg.fill(f"#alm-dom-hora-{pid}", "11:00"); await pg.wait_for_timeout(1500)
        check("horário do domingo vale no domingo", await sun.get_attribute("data-alm") == "11:00", await sun.get_attribute("data-alm") if await sun.count() else None)
        seg = pg.locator(f"tr[data-pessoa='{pid}'] button[data-alm]").first
        check("dias de semana não mudam", await seg.get_attribute("data-alm") != "11:00" or await pg.input_value(f"#alm-hora-{pid}") == "11:00")
        check("aviso na tela", "almoço de domingo" in await pg.inner_text("body"))
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(5000)
        check("gravado após recarregar", await pg.input_value(f"#alm-dom-hora-{pid}") == "11:00" and await pg.input_value(f"#alm-dom-dur-{pid}") == "60")
        await pg.click(f"#alm-dom-auto-{pid}"); await pg.wait_for_timeout(1200)
        check("voltar ao automático", await pg.input_value(f"#alm-dom-hora-{pid}") == "")
        await pg.select_option(f"#alm-dom-dur-{pid}", ""); await pg.wait_for_timeout(1200)
        check("voltar ao turno de domingo (sem almoço)", "Sem almoço" in await pg.locator(f"#alm-dom-dur-{pid} option:checked").inner_text())
        # celular
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(600)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
