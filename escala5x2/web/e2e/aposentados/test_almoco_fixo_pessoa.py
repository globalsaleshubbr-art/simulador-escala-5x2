# Escala de almoço: horário fixo por pessoa (ou rodízio), respeitado em todos os dias normais
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
SEM="t=>{const hs=[...t.querySelectorAll('thead th')].map(h=>h.textContent.trim().toLowerCase());return [...t.querySelectorAll('tbody tr')].map(r=>({nome:(r.querySelector('th')||{}).textContent||'',cel:[...r.querySelectorAll('td')].map(td=>{const b=td.querySelector('button[data-alm]');return b&&b.dataset.alm?{ini:b.dataset.alm,dia:hs[td.cellIndex]||''}:null})}))}"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(5000)
        card = pg.locator("[id^=alm-pes-]").filter(has=pg.locator("h2, h3")).first
        check("quadro 'Horário de almoço de cada pessoa' aparece", await pg.locator("text=Horário de almoço de cada pessoa").count() >= 1)
        await pg.locator("[id^=alm-pes-abrir-]").first.click(); await pg.wait_for_timeout(400)
        linhas = pg.locator("tr[data-pessoa]")
        n = await linhas.count()
        check("lista as pessoas do setor", n >= 5, n)
        pid = await linhas.nth(2).get_attribute("data-pessoa")
        nome = (await linhas.nth(2).locator("th").inner_text()).split("\n")[0].strip()
        check("começa no rodízio", await pg.input_value(f"#alm-pes-modo-{pid}") == "rodizio")
        await pg.select_option(f"#alm-pes-modo-{pid}", "fixo"); await pg.wait_for_timeout(1500)
        check("horário fixo: aparece o campo de hora", await pg.locator(f"#alm-pes-hora-{pid}").count() == 1)
        await pg.fill(f"#alm-pes-hora-{pid}", "11:30"); await pg.wait_for_timeout(2000)
        check("hora gravada", await pg.input_value(f"#alm-pes-hora-{pid}") == "11:30", await pg.input_value(f"#alm-pes-hora-{pid}"))
        await pg.locator(f"#alm-pes-{(await pg.locator('[id^=alm-pes-abrir-]').first.get_attribute('id'))[len('alm-pes-abrir-'):]}").screenshot(path=D+"almoco_fixo_pessoa.png")
        # semana: a pessoa almoça às 11:30 em todos os dias normais
        for sem in range(3):
            await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1200)
            r = await pg.locator("[id^=alm-semana-tab-]").first.evaluate(SEM)
            minha = [c["ini"] for x in r if x["nome"].startswith(nome) for c in x["cel"] if c and not c["dia"].startswith("dom")]
            check(f"semana {sem+1}: {nome} sempre às 11:30", minha and set(minha) == {"11:30"}, minha)
            await pg.locator("[aria-label='Próxima semana']").click(); await pg.wait_for_timeout(800)
        await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(800)
        # horário fora do intervalo do turno: avisa
        await pg.fill(f"#alm-pes-hora-{pid}", "16:00"); await pg.wait_for_timeout(1500)
        aviso = await pg.locator(f"#alm-pes-aviso-{pid}").inner_text() if await pg.locator(f"#alm-pes-aviso-{pid}").count() else ""
        check("fora do turno/intervalo: avisa", "Fora do horário" in aviso or "Não cabe" in aviso, aviso)
        await pg.fill(f"#alm-pes-hora-{pid}", "12:00"); await pg.wait_for_timeout(1500)
        # gravado após recarregar
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(4500)
        if not await pg.locator(f"#alm-pes-modo-{pid}").count(): await pg.locator("[id^=alm-pes-abrir-]").first.click(); await pg.wait_for_timeout(400)
        check("gravado após recarregar", await pg.input_value(f"#alm-pes-modo-{pid}") == "fixo" and await pg.input_value(f"#alm-pes-hora-{pid}") == "12:00")
        # voltar ao rodízio
        await pg.select_option(f"#alm-pes-modo-{pid}", "rodizio"); await pg.wait_for_timeout(1500)
        check("voltar ao rodízio tira o campo", await pg.locator(f"#alm-pes-hora-{pid}").count() == 0)
        await pg.set_viewport_size({"width":390,"height":844}); await pg.wait_for_timeout(500)
        over = await pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        check("celular sem rolagem lateral", over <= 1, over)
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
