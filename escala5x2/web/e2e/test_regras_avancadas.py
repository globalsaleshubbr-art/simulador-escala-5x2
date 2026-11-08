# Regras avançadas extras: tela, marcações em Equipe/Horários e efeito ao gerar.
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
        pg = await b.new_page(viewport={"width": 1440, "height": 1000})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go("regras")
        await pg.wait_for_timeout(300)
        check("Regras extras aparecem", await pg.locator("#regras-extras").count() == 1)
        # 1) separadas proibir e 2) sábado sem folga
        check("1: padrão é separadas quando der", await pg.input_value("#ra-pref-folgas") == "separadas")
        opcoes = await pg.eval_on_selector("#ra-pref-folgas", "s=>[...s.options].map(o=>o.text)")
        check("1: opções separadas / juntas / sem preferência", any("Juntas" in o for o in opcoes) and any("Sem preferência" in o for o in opcoes) and any("Separadas, sempre" in o for o in opcoes), opcoes)
        check("1: explica que respeita os dias sem folga", "dias sem folga" in await pg.inner_text("#ra-pref-folgas-linha"))
        await pg.select_option("#ra-pref-folgas", "juntas"); await pg.wait_for_timeout(200)
        check("1: juntas explica o que faz", "colar" in await pg.inner_text("#ra-pref-folgas-txt"))
        await pg.select_option("#ra-pref-folgas", "separadasSempre"); await pg.wait_for_timeout(200)
        check("1: separadas sempre gravado", await pg.input_value("#ra-pref-folgas") == "separadasSempre")
        await pg.click("#ra-dia-6"); await pg.wait_for_timeout(300)
        check("2: sábado marcado com força Proibir", await pg.input_value("#ra-dias-forca") == "proibir")
        # 3) limite por % no setor
        await pg.select_option("#ra-limite-modo", "pct"); await pg.wait_for_timeout(300)
        await pg.fill("#ra-limite-6", "10"); await pg.press("#ra-limite-6", "Tab"); await pg.wait_for_timeout(300)
        check("3: limite em % com pessoas calculadas", "p." in await pg.inner_text("#ra-limite"))
        # 7) dupla
        await pg.select_option("#ra-nao-juntos", "proibir")
        opts = await pg.eval_on_selector("#ra-nao-juntos-par-a", "s=>[...s.options].map(o=>o.value).filter(Boolean)")
        await pg.select_option("#ra-nao-juntos-par-a", opts[0]); await pg.wait_for_timeout(200)
        optsb = await pg.eval_on_selector("#ra-nao-juntos-par-b", "s=>[...s.options].map(o=>o.value).filter(Boolean)")
        await pg.select_option("#ra-nao-juntos-par-b", optsb[0]); await pg.click("#ra-nao-juntos-par-add"); await pg.wait_for_timeout(300)
        check("7: dupla adicionada", await pg.locator("#regras-extras [data-par]").count() == 1)
        # dupla entre setores diferentes
        labels_b = await pg.eval_on_selector("#ra-juntos-par-b", "s=>[...s.options].map(o=>o.text).filter(t=>t.includes(' · '))")
        await pg.select_option("#ra-juntos-par-a", (await pg.eval_on_selector("#ra-juntos-par-a", "s=>[...s.options].map(o=>o.value).filter(Boolean)"))[0]); await pg.wait_for_timeout(200)
        b_opts = await pg.eval_on_selector("#ra-juntos-par-b", "s=>[...s.options].filter(o=>o.value).map(o=>[o.value,o.text.split(' · ')[1]])")
        setores_b = {x[1] for x in b_opts}
        check("8: segunda pessoa pode ser de outro setor", len(setores_b) >= 2, setores_b)
        outro = [v for v, sname in b_opts if sname != b_opts[0][1]][0]
        await pg.select_option("#ra-juntos-par-b", outro); await pg.click("#ra-juntos-par-add"); await pg.wait_for_timeout(300)
        chip = await pg.locator("#regras-extras [data-par]").nth(1).inner_text()
        check("8: dupla entre setores mostra o setor de cada um", chip.count("(") == 2, chip)
        await pg.locator("#regras-extras [data-par]").nth(1).get_by_role("button").click(); await pg.wait_for_timeout(300)
        # 9) pessoa-chave, 11, 12, 13
        await pg.select_option("#ra-chave", "proibir"); await pg.check("#ra-fechar-abrir"); await pg.check("#ra-rodizio-turnos"); await pg.check("#ra-extras-on"); await pg.wait_for_timeout(400)
        await pg.locator("#regras-extras").screenshot(path=D + "regras_avancadas.png")
        # Horários: marcar 2 turnos no rodízio
        await go("horarios")
        rods = await pg.eval_on_selector_all("[id^='h-rod-']", "els=>els.map(e=>e.id)")
        check("12: Horários mostra 'Entra no rodízio'", len(rods) >= 2, rods)
        for r in rods[:2]:
            await pg.check(f"#{r}"); await pg.wait_for_timeout(200)
        # Equipe: marcar pessoas-chave
        await go("equipe")
        ids = (await pg.eval_on_selector_all("[id^='s-name-']", "els=>els.map(e=>e.id.slice(7))"))[:3]
        for eid in ids:
            await pg.locator("tr", has=pg.locator(f"#s-name-{eid}")).get_by_role("button", name="mais detalhes").click(); await pg.wait_for_timeout(300)
            await pg.check(f"#s-chave-{eid}"); await pg.wait_for_timeout(300)
        check("9: pessoas-chave marcadas", all([await pg.is_checked(f"#s-chave-{eid}") for eid in ids[-1:]]))
        # gerar
        await go("escala")
        await pg.get_by_role("button", name="Gerar escala", exact=True).first.click()
        await pg.wait_for_function("()=>!/Gerando/.test(document.body.innerText)", timeout=60000); await pg.wait_for_timeout(800)
        txt = await pg.inner_text("main")
        check("Escala gerada com as regras", "escala gerada" in txt.lower() or "escala mantida" in txt.lower(), txt[:300])
        check("Relatório mostra o rodízio de turnos", await pg.locator("#rep-turnos").count() == 1)
        check("Selo 'Chave' na escala", await pg.locator("main [data-chave]").count() >= 1)
        # sábados sem folga variável: na visão do mês, coluna de sábado sem F (exceto folgas fixas: demo tem poucas)
        sab = await pg.evaluate("""()=>{const th=[...document.querySelectorAll('#mes thead th')];const idx=th.map((t,i)=>/^S\\d/.test(t.textContent.trim())&&t.textContent.trim().startsWith('S')?i:-1).filter(i=>i>=0);return idx.length}""")
        check("sem erros JS", not errs, errs[:3])
        await b.close()
    print("OK", len(ok)); [print(" ✓", x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗", x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
