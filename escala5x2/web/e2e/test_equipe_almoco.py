# Equipe: horário e tempo de almoço no cadastro de cada pessoa (o mesmo da Escala de Almoço)
import asyncio, os, re
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
def mins(h): a, b = map(int, h.split(":")); return a * 60 + b
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def go(h): await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(1500)
        await pg.goto(URL + "#equipe"); await pg.wait_for_timeout(5000)
        check("coluna Almoço na Equipe", "ALMOÇO" in (await pg.inner_text("main table thead")).upper())
        horas = pg.locator("input[id^='s-alm-hora-']")
        check("horário de almoço de cada pessoa", await horas.count() >= 5, await horas.count())
        pid = (await horas.nth(1).get_attribute("id"))[len("s-alm-hora-"):]
        h0 = await pg.input_value(f"#s-alm-hora-{pid}")
        check("já vem com o horário sugerido", re.match(r"\d\d:\d\d", h0) is not None, h0)
        nv = f"{(mins(h0)+30)//60:02d}:{(mins(h0)+30)%60:02d}"
        await pg.fill(f"#s-alm-hora-{pid}", nv); await pg.wait_for_timeout(1200)
        check("muda o horário no cadastro", await pg.input_value(f"#s-alm-hora-{pid}") == nv)
        txt = await pg.inner_text(f"#s-alm-{pid}")
        await pg.select_option(f"#s-alm-dur-{pid}", "90"); await pg.wait_for_timeout(1200)
        txt2 = await pg.inner_text(f"#s-alm-{pid}")
        check("tempo de almoço: 'até' anda junto", f"até {(mins(nv)+90)//60:02d}:{(mins(nv)+90)%60:02d}" in txt2, txt2)
        check("aviso com a nova saída", "A saída fica às" in await pg.inner_text("body"))
        # vale na Escala de Almoço
        await go("almoco")
        check("Escala de Almoço com o mesmo horário", await pg.input_value(f"#alm-hora-{pid}") == nv, await pg.input_value(f"#alm-hora-{pid}"))
        check("Escala de Almoço com o mesmo tempo", await pg.input_value(f"#alm-dur-{pid}") == "90")
        cel = pg.locator(f"button[id^='alm-dia-{pid}-']")
        hs = {await cel.nth(i).get_attribute("data-alm") for i in range(await cel.count())}
        dom = await pg.evaluate("()=>[...document.querySelectorAll('button[data-dia]')].map(b=>b.dataset.dia).filter(d=>new Date(d+'T12:00').getDay()===0)")
        hs = {await cel.nth(i).get_attribute("data-alm") for i in range(await cel.count()) if (await cel.nth(i).get_attribute("data-dia")) not in dom}
        check("os dias da semana seguem o horário do cadastro", hs <= {nv}, hs)
        # gravado
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(5000); await go("equipe")
        check("gravado após recarregar", await pg.input_value(f"#s-alm-hora-{pid}") == nv and await pg.input_value(f"#s-alm-dur-{pid}") == "90")
        # horário que não cabe: aviso
        await pg.fill(f"#s-alm-hora-{pid}", "06:00"); await pg.wait_for_timeout(1200)
        av = await pg.locator(f"#s-alm-aviso-{pid}").inner_text() if await pg.locator(f"#s-alm-aviso-{pid}").count() else ""
        check("horário que não cabe: avisa", "Não cabe" in av or "Fora do horário" in av, av)
        await pg.select_option(f"#s-alm-dur-{pid}", ""); await pg.wait_for_timeout(800)
        check("voltar ao tempo do turno", "(turno)" in await pg.locator(f"#s-alm-dur-{pid} option:checked").inner_text())
        await pg.locator("main table").first.screenshot(path=D+"equipe_almoco.png")
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(500)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
