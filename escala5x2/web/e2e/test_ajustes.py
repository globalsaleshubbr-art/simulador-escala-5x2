import asyncio, re
from playwright.async_api import async_playwright
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D+"exp", exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(900)
        await pg.goto(URL); await pg.wait_for_timeout(4000)
        check("nenhuma escala refeita sozinha ao abrir", "a escala foi refeita" not in await pg.inner_text("body"))
        # almoço: intervalo só de um dia
        await go("almoco"); await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(800)
        cel = pg.locator("button[id^='alm-dia-']").first
        iid = await cel.get_attribute("id")
        v0 = await cel.get_attribute("data-alm")
        h, m = map(int, v0.split(":")); nv = f"{(h+1)%24:02d}:{m:02d}"
        await cel.click(); await pg.wait_for_timeout(300)
        ed = pg.locator("[id^='alm-ed-']").first
        await ed.locator("input").fill(nv); await ed.locator("[id$='-salvar']").click(); await pg.wait_for_timeout(800)
        check("intervalo do dia mudou", await pg.get_attribute("#"+iid, "data-alm") == nv)
        check("marca 'só hoje'", await pg.get_attribute("#"+iid, "data-manual") == "1")
        await pg.get_by_role("button", name="Próximo dia").click(); await pg.wait_for_timeout(500)
        emp = iid[len("alm-dia-"):].rsplit("-", 3)[0]
        outro = pg.locator(f"button[id^='alm-dia-{emp}-']")
        v2 = await outro.first.get_attribute("data-alm") if await outro.count() else v0
        check("outro dia continua com o intervalo de sempre", v2 == v0, (v2, v0))
        await pg.get_by_role("button", name="Dia anterior").click(); await pg.wait_for_timeout(400)
        await pg.reload(); await pg.wait_for_timeout(3500); await go("almoco"); await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(800)
        check("intervalo do dia salvo", await pg.get_attribute("#"+iid, "data-alm") == nv)
        # filtro de loja único: escolher numa tela vale nas outras
        await go("lojas"); await pg.fill("#ns-names", "Loja 2"); await pg.click("#ns-create"); await pg.wait_for_timeout(800)
        await go("equipe")
        v1 = await pg.eval_on_selector("#eq-store", "s=>[...s.options].find(o=>o.textContent.includes('Centro')).value")
        await pg.select_option("#eq-store", v1); await pg.wait_for_timeout(500)
        await go("domingos")
        check("loja escolhida na Equipe vale em Domingos", await pg.input_value("#dom-store") == v1)
        check("e vira a loja em edição", "Centro" in await pg.inner_text("#store-filter"))
        await pg.select_option("#dom-store", "all"); await pg.wait_for_timeout(500)
        await go("almoco")
        check("'Todas as lojas' também vale nas outras telas", await pg.input_value("#alm-store") == "all")
        # férias: de … até (sem admissão)
        await go("ferias")
        await pg.select_option("#vac-store", v1); await pg.wait_for_timeout(400)
        check("férias sem campo de admissão", "Admissão" not in await pg.inner_text("#vac-table"))
        await pg.locator("#vac-table input[id^='vac-de-']").first.fill("2027-03-01"); await pg.wait_for_timeout(500)
        kp = await pg.inner_text("#vac-kpis")
        check("férias programadas contam no resumo", re.search(r"COM FÉRIAS PROGRAMADAS\s+1", kp, re.I) is not None, kp)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
