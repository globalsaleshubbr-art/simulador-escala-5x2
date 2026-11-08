# Regra: mudou o horário de alguém (almoço, turno, horário do turno, folgas), todas as telas mostram o novo horário.
import asyncio, os, re
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def mins(h): a, b = map(int, h.split(":")); return a * 60 + b
def hm(m): return f"{m//60:02d}:{m%60:02d}"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(1800)
        await pg.goto(URL + "#equipe"); await pg.wait_for_timeout(5500)
        pid = (await pg.locator("input[id^='s-alm-hora-']").nth(2).get_attribute("id"))[len("s-alm-hora-"):]
        nome = await pg.input_value(f"#s-name-{pid}")
        async def escala_cells():
            await go("escala")
            return await pg.eval_on_selector_all(f"#semana button[aria-label^='{nome},']", "bs=>bs.map(b=>b.getAttribute('aria-label'))")
        # ---------- 1) muda o almoço na Escala de Almoço
        await go("almoco")
        await pg.fill(f"#alm-hora-{pid}", "13:00"); await pg.wait_for_timeout(1000)
        await pg.select_option(f"#alm-dur-{pid}", "75"); await pg.wait_for_timeout(1500)
        await go("equipe")
        check("1 · Equipe mostra o almoço mudado na Escala de Almoço", await pg.input_value(f"#s-alm-hora-{pid}") == "13:00" and await pg.input_value(f"#s-alm-dur-{pid}") == "75")
        cel = await escala_cells()
        dias_trab = [c for c in cel if "intervalo" in c and "domingo" not in c.lower()]
        check("1 · Escala (semana) mostra o intervalo 13:00–14:15", dias_trab and all("intervalo 13:00–14:15" in c for c in dias_trab), dias_trab[:2])
        # ---------- 2) muda o turno na Equipe
        await go("equipe")
        opts = await pg.eval_on_selector(f"#s-shift-{pid}", "s=>[...s.options].map(o=>[o.value,o.textContent,o.selected])")
        atual = [o for o in opts if o[2]][0]
        outro = [o for o in opts if not o[2] and "—" not in o[1]][0]
        await pg.select_option(f"#s-shift-{pid}", outro[0]); await pg.wait_for_timeout(2000)
        ini = re.search(r"\((\d\d:\d\d)–", outro[1]).group(1)
        cel = await escala_cells()
        dias_trab = [c for c in cel if "intervalo" in c and "domingo" not in c.lower()]
        check("2 · Escala mostra a entrada do turno novo", dias_trab and all(f": {ini}–" in c for c in dias_trab), (ini, dias_trab[:2]))
        await go("almoco")
        th = await pg.locator(f"tr[data-pessoa='{pid}'] th").inner_text()
        check("2 · Escala de Almoço mostra o turno novo", outro[1].split(" (")[0] in th and ini in th, th)
        h2 = await pg.input_value(f"#alm-hora-{pid}")
        check("2 · almoço continua válido no turno novo (sem aviso)", await pg.locator(f"#alm-aviso-{pid}").count() == 0, (h2, th))
        await go("equipe")
        check("2 · Equipe e Escala de Almoço com o mesmo almoço", await pg.input_value(f"#s-alm-hora-{pid}") == h2)
        # ---------- 3) muda o horário do turno em Horários (+30 min)
        await go("horarios")
        sid = outro[0]
        st0 = await pg.input_value(f"#h-start-{sid}")
        novo = hm(mins(st0) + 30)
        await pg.fill(f"#h-start-{sid}", novo); await pg.wait_for_timeout(2000)
        cel = await escala_cells()
        dias_trab = [c for c in cel if "intervalo" in c and "domingo" not in c.lower()]
        check("3 · Escala mostra o horário novo do turno", dias_trab and all(f": {novo}–" in c for c in dias_trab), (novo, dias_trab[:2]))
        await go("almoco")
        th = await pg.locator(f"tr[data-pessoa='{pid}'] th").inner_text()
        check("3 · Escala de Almoço mostra o horário novo do turno", novo in th, th)
        check("3 · almoço sem aviso depois de mudar o turno", await pg.locator(f"#alm-aviso-{pid}").count() == 0)
        h3 = await pg.input_value(f"#alm-hora-{pid}")
        # ---------- 4) muda as folgas (5x2 → 6x1): o almoço escolhido fica
        await go("equipe")
        await pg.select_option(f"#s-reg-{pid}", "f1"); await pg.wait_for_timeout(2000)
        check("4 · mudar 5x2 → 6x1 não apaga o almoço escolhido", await pg.input_value(f"#s-alm-hora-{pid}") == h3, (await pg.input_value(f"#s-alm-hora-{pid}"), h3))
        await go("almoco")
        check("4 · Escala de Almoço igual", await pg.input_value(f"#alm-hora-{pid}") == h3)
        # ---------- 5) Pessoas na loja acompanha (soma das horas do dia muda com o almoço maior)
        g = pg.locator("[id^=alm-graf-]").filter(has=pg.locator("svg")).first
        d0 = await g.locator("svg path").nth(1).get_attribute("d")
        await pg.select_option(f"#alm-dur-{pid}", "105"); await pg.wait_for_timeout(1500)
        d1 = await g.locator("svg path").nth(1).get_attribute("d")
        check("5 · gráfico do setor muda junto", d0 != d1)
        # ---------- 6) depois de recarregar, tudo igual
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(5000)
        await go("equipe")
        check("6 · gravado (Equipe)", await pg.input_value(f"#s-alm-hora-{pid}") == h3 and await pg.input_value(f"#s-alm-dur-{pid}") == "105")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
