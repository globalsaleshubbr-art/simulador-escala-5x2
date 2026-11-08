# Escala de almoço: escolher entre rodízio (varia a cada dia) e horário fixo (sempre o mesmo)
import asyncio, os
from playwright.async_api import async_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida") + "/"
os.makedirs(D, exist_ok=True)
URL=os.environ.get("ESCALA_URL", "file://" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "simples-local.html"))
ok=[]; fail=[]
def check(n,c,i=""): (ok if c else fail).append(n+("" if c else f" [{i}]"))
# almoços da semana: linha (pessoa), coluna (dia) e o cabeçalho da coluna
SEM="t=>{const hs=[...t.querySelectorAll('thead th')].map(h=>h.textContent.trim().toLowerCase());return [...t.querySelectorAll('button[data-alm]')].filter(b=>b.dataset.alm).map(b=>({ini:b.dataset.alm,row:b.closest('tr').rowIndex,dia:hs[b.closest('td').cellIndex]||''}))}"
def por_pessoa(a):
    out={}
    for x in a:
        if x["dia"].startswith("dom"): continue
        out.setdefault(x["row"], set()).add(x["ini"])
    return out
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":1000})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL + "#almoco"); await pg.wait_for_timeout(5000)
        sel = pg.locator("select[id^=alm-modo-]").first
        sid = (await sel.get_attribute("id"))[len("alm-modo-"):]
        check("opção aparece com rodízio como padrão", await sel.input_value() == "rodizio")
        txt = await pg.eval_on_selector(f"#alm-modo-{sid}", "s=>[...s.options].map(o=>o.text)")
        check("opções rodízio e horário fixo", any("Rodízio" in t for t in txt) and any("Sempre o mesmo" in t for t in txt), txt)
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1000)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        rod = por_pessoa(await tab.evaluate(SEM))
        check("rodízio: há pessoas com horário diferente na semana", sum(1 for v in rod.values() if len(v) > 1) >= 1, {k: sorted(v) for k, v in list(rod.items())[:4]})
        await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(800)
        await pg.select_option(f"#alm-modo-{sid}", "fixo"); await pg.wait_for_timeout(1500)
        check("texto explica o horário fixo", "mesmo horário" in await pg.inner_text(f"#alm-modo-txt-{sid}"))
        await pg.locator(f"#alm-modo-box-{sid}").screenshot(path=D+"almoco_modo.png")
        await pg.click("#alm-ver-semana"); await pg.wait_for_timeout(1000)
        tab = pg.locator("[id^=alm-semana-tab-]").first
        fix = por_pessoa(await tab.evaluate(SEM))
        check("fixo: cada pessoa com um horário só de segunda a sábado", len(fix) >= 5 and all(len(v) == 1 for v in fix.values()), {k: sorted(v) for k, v in fix.items() if len(v) > 1})
        check("fixo: horários continuam espalhados", len({next(iter(v)) for v in fix.values()}) >= 3)
        # gravado
        await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(4500)
        if await pg.locator("#alm-ver-dia").count(): await pg.click("#alm-ver-dia"); await pg.wait_for_timeout(800)
        check("gravado após recarregar", await pg.input_value(f"#alm-modo-{sid}") == "fixo")
        check("sem erros JS", not errs, errs[:2])
        await b.close()
    print("OK", len(ok)); [print(" ✓",x) for x in ok]; print("FALHAS", len(fail)); [print(" ✗",x) for x in fail]
asyncio.run(main())
import sys as _s
_s.exit(1 if fail else 0)
